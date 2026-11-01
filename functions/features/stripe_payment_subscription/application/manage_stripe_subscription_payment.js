const {studentSubscriptionAccess} = require("../../syllabus_subscription/domain/student_subscription_access");
const {createHash} = require("node:crypto");
const {cardChangeScope} = require("./card_change_scope");
const {loadOwnedStripeSubscription, loadOwnedSubscriptionInvoice,
  recoveryResult, requireStripeReference, paymentError} = require("./load_owned_subscription_invoice");
const {publicRecovery} = require("../../syllabus_subscription/domain/renewal_recovery");
const {publicRetry} = require("../../syllabus_subscription/domain/renewal_retry");
const {withMetadata} = require("../../syllabus_subscription/domain/subscription_payment_view");

const CARD_CHANGE_STATUSES = new Set(["active", "trialing", "past_due", "unpaid", "paused"]);
function canChangeCard(subscription) {
  return CARD_CHANGE_STATUSES.has(subscription.status)
    && subscription.collectionMethod === "charge_automatically";
}
function requireCardChange(subscription) {
  if (!canChangeCard(subscription)) throw paymentError("failed-precondition",
    "This subscription cannot accept a new card for future charges.");
}
async function ownedCard(owned, paymentMethodReference, allowMissing = false) {
  if (!paymentMethodReference) return null;
  let method;
  try { method = await owned.paymentProvider.retrievePaymentMethod(paymentMethodReference); }
  catch (error) {
    if (allowMissing && error?.code === "resource_missing") return null;
    throw error;
  }
  if (allowMissing && (!method.customerReference || method.type !== "card")) return null;
  if (method.paymentMethodReference !== paymentMethodReference
    || method.customerReference !== owned.customer.customerReference || method.type !== "card") {
    throw paymentError("failed-precondition", "The saved payment card is unavailable.");
  }
  return method;
}
function targetFingerprint(targets) {
  return createHash("sha256").update(JSON.stringify(targets.map(t => [t.subscriptionReference, t.studentId])
    .sort((a, b) => a[0].localeCompare(b[0])))).digest("hex");
}
function maskedCard(method) {
  return method?.card ? {brand: method.card.brand, last4: method.card.last4,
    expiryMonth: method.card.expiryMonth, expiryYear: method.card.expiryYear} : null;
}

class ManageStripeSubscriptionPayment {
  constructor(dependencies) {
    this.dependencies = dependencies;
    this.now = dependencies.now || (() => new Date());
  }

  async cardTargets(owned) {
    if (!this.dependencies.listSubscriptionRecords || !this.dependencies.getGuardianStudentLink) return [];
    const records = await this.dependencies.listSubscriptionRecords({mode: owned.mode,
      customerReference: owned.customer.customerReference});
    const targets = [];
    for (const record of records) {
      if (!record.studentId) continue;
      if (record.mode !== owned.mode || record.customerReference !== owned.customer.customerReference) {
        throw paymentError("failed-precondition", "Unexpected subscription registration.");
      }
      const link = await this.dependencies.getGuardianStudentLink({guardianId: owned.internalReference, studentId: record.studentId});
      if (link?.state !== "active") continue;
      let subscription;
      try { subscription = record.subscriptionReference === owned.subscriptionReference ? owned.subscription
        : await owned.paymentProvider.retrieveSubscription(record.subscriptionReference, {includeRecoveryDetails: true}); }
      catch (error) {if (error?.code === "resource_missing") continue; throw error;}
      if (subscription.subscriptionReference !== record.subscriptionReference
        || subscription.customerReference !== owned.customer.customerReference) throw paymentError("failed-precondition", "Unexpected subscription owner.");
      if (!canChangeCard(subscription)) continue;
      if (this.dependencies.canChangeRecoveryCard && !await this.dependencies.canChangeRecoveryCard({studentId: record.studentId,
        mode: owned.mode, subscriptionReference: record.subscriptionReference})) continue;
      const student = await this.dependencies.getStudentById(record.studentId);
      targets.push({subscriptionReference: record.subscriptionReference, studentId: record.studentId,
        studentName: student?.name || record.studentId,
        planId: require("./billing_plan_version").subscriptionBillingRecord(record, subscription).planId || null});
    }
    return targets.sort((a, b) => a.subscriptionReference.localeCompare(b.subscriptionReference));
  }

  async getDetails(input, loaded = null) {
    if (this.dependencies.getRenewalRecoveryDetails) {
      const current = await this.dependencies.getRenewalRecoveryDetails(input, loaded);
      if (current) return current;
    }
    let owned = loaded || await loadOwnedStripeSubscription(this.dependencies, input);
    if (this.dependencies.ensureRenewalRecovery) {
      const upgrade = await this.dependencies.ensureRenewalRecovery(owned);
      if (upgrade?.outcome === "held" || upgrade?.outcome === "restarted") owned = await loadOwnedStripeSubscription(this.dependencies, input);
    }
    const {subscription, record} = owned;
    const method = await ownedCard(owned, subscription.defaultPaymentMethodReference, true);
    let latest = null;
    if (owned.selectedInvoiceReference) {
      latest = recoveryResult(await loadOwnedSubscriptionInvoice(this.dependencies,
        {...input, invoiceReference: owned.selectedInvoiceReference}, owned));
    }
    const linkedInvoiceIsCurrent = !input.invoiceReference
      || input.invoiceReference === owned.selectedInvoiceReference;
    if (!linkedInvoiceIsCurrent) {
      // Validate old links too; never accept another customer's Invoice ID.
      await loadOwnedSubscriptionInvoice(this.dependencies, input, owned);
    }
    if (latest?.paymentState === "paid" && this.dependencies.observeRecoveredPayment) {
      const recovery = await this.dependencies.observeRecoveredPayment({...owned, context: {invoiceReference: latest.invoiceReference}});
      if (recovery?.outcome === "restarted") return this.getDetails(input);
    }
    const student = record.studentId && this.dependencies.getStudentSubscription
      ? await this.dependencies.getStudentSubscription(record.studentId) : null;
    const invoice = latest && record.studentId && this.dependencies.getInvoiceRecord
      ? await this.dependencies.getInvoiceRecord({studentId: record.studentId, paymentProvider: "stripe",
        paymentMode: owned.mode, paymentSubscriptionReference: owned.subscriptionReference,
        invoiceReference: latest.invoiceReference}) : null;
    const retry = publicRetry(invoice?.renewalRetry, true);
    const identity = record.studentId && this.dependencies.getStudentById
      ? await this.dependencies.getStudentById(record.studentId) : null;
    let cardChangeTargets = [], cardChangeTargetsAvailable = true;
    try {cardChangeTargets = await this.cardTargets(owned);}
    catch {cardChangeTargetsAvailable = false;}

    const selected = student && [student, student.billingSummary].some(context => context?.paymentMode === owned.mode
      && context?.paymentSubscriptionReference === owned.subscriptionReference);
    return withMetadata({
      subscriptionReference: subscription.subscriptionReference,
      subscriptionStatus: subscription.status,
      ...(record.billingStartsAt && subscription.status === "trialing" ? {firstChargeAt: record.billingStartsAt.toISOString()} : {}),
      applicationStatus: selected ? (!studentSubscriptionAccess(student, this.now()).allowed)
        ? "suspended" : student.applicationStatus || "active" : "active",
      renewalRetry: retry, renewalRecovery: student?.renewalRecovery && latest && student.renewalRecovery.invoiceReference === latest.invoiceReference
        ? publicRecovery(student.renewalRecovery, true) : null,
      currentCard: maskedCard(method), canChangeCard: canChangeCard(subscription),
      nextChargeAt: !subscription.cancelAtPeriodEnd && !subscription.paused
        && ["active", "trialing"].includes(subscription.status)
        ? subscription.currentPeriodEnd?.toISOString() || null : null,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      studentId: record.studentId || null, studentName: identity?.name || record.studentId || null,
      planId: record.planId || null, cardChangeTargets,
      canChangeAllStudents: cardChangeTargetsAvailable && cardChangeTargets.length > 1
        && cardChangeTargets.some(t => t.subscriptionReference === owned.subscriptionReference),
      paymentState: latest?.paymentState || "no_invoice",
      renewal: latest?.billingReason === "subscription_cycle"
        ? {...latest, ...(retry ? {nextPaymentAttemptAt: retry.nextAttemptAt} : {})} : null,
      linkedInvoiceIsCurrent,
    }, subscription);
  }

  async createCardSetup(input) {
    const attempt = input.idempotencyReference;
    if (typeof attempt !== "string" || !attempt.trim() || attempt.length > 500) {
      throw paymentError("invalid-argument", "idempotencyReference is invalid.");
    }
    const scope = cardChangeScope(input.cardChangeScope);
    const owned = await loadOwnedStripeSubscription(this.dependencies, input);
    requireCardChange(owned.subscription);
    if (this.dependencies.canChangeRecoveryCard && !await this.dependencies.canChangeRecoveryCard({studentId: owned.record.studentId,
      mode: owned.mode, subscriptionReference: owned.subscriptionReference})) throw paymentError("failed-precondition", "Finish or cancel the pending payment before changing its card.");
    const targets = scope === "all_students" ? await this.cardTargets(owned) : null;
    if (targets && (!targets.length || !targets.some(t => t.subscriptionReference === owned.subscriptionReference))) {
      throw paymentError("failed-precondition", "No eligible student subscriptions are available for this card change.");
    }
    const intent = await owned.paymentProvider.createSetupIntent(owned.customer.customerReference, {
      idempotencyReference: attempt.trim(),
      metadata: {purpose: "subscription_card_update", mode: owned.mode,
        subscriptionReference: owned.subscriptionReference, internalReference: owned.internalReference,
        ...(targets ? {cardChangeScope: scope, cardUpdateFingerprint: targetFingerprint(targets)} : {})},
    });
    requireStripeReference(intent.setupIntentReference, "seti_", "setupIntentReference");
    if (!intent.clientSecret || intent.usage !== "off_session") throw Error("Invalid card SetupIntent.");
    await this.dependencies.writeSetupIntentRecord({mode: owned.mode,
      customerReference: owned.customer.customerReference,
      setupIntentReference: intent.setupIntentReference, status: intent.status,
      usage: intent.usage, paymentMethodReference: intent.paymentMethodReference,
      ...(targets ? {cardUpdate: {scope, targets: targets.map(({subscriptionReference, studentId}) => ({subscriptionReference, studentId}))}} : {})});
    return {setupIntentReference: intent.setupIntentReference, clientSecret: intent.clientSecret,
      ...(targets ? {cardChangeTargets: targets} : {})};
  }

  async updateCard(input) {
    const setupIntentReference = requireStripeReference(input.setupIntentReference,
      "seti_", "setupIntentReference");
    const scope = cardChangeScope(input.cardChangeScope);
    const owned = await loadOwnedStripeSubscription(this.dependencies, input);
    if (this.dependencies.canChangeRecoveryCard && !await this.dependencies.canChangeRecoveryCard({studentId: owned.record.studentId,
      mode: owned.mode, subscriptionReference: owned.subscriptionReference})) throw paymentError("failed-precondition", "Finish or cancel the pending payment before changing its card.");
    if (scope === "subscription") requireCardChange(owned.subscription);
    const intent = await owned.paymentProvider.retrieveSetupIntent(setupIntentReference);
    if (intent.status !== "succeeded" || intent.usage !== "off_session"
      || intent.customerReference !== owned.customer.customerReference
      || intent.metadata?.purpose !== "subscription_card_update"
      || intent.metadata?.subscriptionReference !== owned.subscriptionReference
      || intent.metadata?.internalReference !== owned.internalReference
      || intent.metadata?.mode !== owned.mode
      || cardChangeScope(intent.metadata?.cardChangeScope) !== scope) {
      throw paymentError("failed-precondition", "The card setup is not valid for this subscription.");
    }
    const method = await ownedCard(owned, intent.paymentMethodReference);
    if (!method) throw paymentError("failed-precondition", "Card setup did not return a saved card.");
    if (scope === "all_students") return this.updateAllCards(input, owned, intent, method);
    if (owned.subscription.defaultPaymentMethodReference !== method.paymentMethodReference
      || owned.subscription.saveDefaultPaymentMethod !== "on_subscription") {
      const age = this.now().getTime() - intent.createdAt?.getTime();
      // Keep every replay within Stripe's idempotency retention window. An old
      // setup cannot replace a newer card after its cached update has expired.
      if (!Number.isFinite(age) || age < -300000 || age > 23 * 60 * 60 * 1000) {
        throw paymentError("failed-precondition", "This card setup has expired. Enter the card again.");
      }
      await owned.paymentProvider.updateSubscriptionPaymentMethod({
        subscriptionReference: owned.subscriptionReference,
        paymentMethodReference: method.paymentMethodReference, setupIntentReference,
      });
    }
    await this.dependencies.writePaymentMethodRecord({mode: owned.mode,
      customerReference: owned.customer.customerReference,
      paymentMethodReference: method.paymentMethodReference, setupIntentReference,
      type: method.type, status: "attached", card: method.card});
    // Original checkout identity/paymentMethodReference is intentionally retained.
    // Stripe is authoritative for the current subscription default card.
    return this.getDetails(input);
  }
  async updateAllCards(input, owned, intent, method) {
    const setupAge = this.now().getTime() - intent.createdAt?.getTime();
    if (!Number.isFinite(setupAge) || setupAge < -300000 || setupAge > 23 * 60 * 60 * 1000) {
      throw paymentError("failed-precondition", "This card setup has expired. Enter the card again.");
    }
    const saved = await this.dependencies.getSetupIntentRecord({mode: owned.mode,
      customerReference: owned.customer.customerReference, setupIntentReference: intent.setupIntentReference});
    const targets = saved?.cardUpdate?.targets;
    if (saved?.cardUpdate?.scope !== "all_students" || !targets?.length
      || targetFingerprint(targets) !== intent.metadata.cardUpdateFingerprint
      || !targets.some(t => t.subscriptionReference === owned.subscriptionReference)) {
      throw paymentError("failed-precondition", "The saved card-change selection is unavailable. Start card setup again.");
    }
    const result = {scope: "all_students", updated: [], failed: [], skipped: []};
    await this.dependencies.writePaymentMethodRecord({mode: owned.mode,
      customerReference: owned.customer.customerReference, paymentMethodReference: method.paymentMethodReference,
      setupIntentReference: intent.setupIntentReference, type: method.type, status: "attached", card: method.card});
    for (const target of targets) {
      try {
        const record = await this.dependencies.getSubscriptionRecord({mode: owned.mode,
          customerReference: owned.customer.customerReference, subscriptionReference: target.subscriptionReference});
        const link = await this.dependencies.getGuardianStudentLink({guardianId: owned.internalReference, studentId: target.studentId});
        if (!record || record.studentId !== target.studentId || record.mode !== owned.mode
          || record.customerReference !== owned.customer.customerReference || link?.state !== "active") {
          result.skipped.push(target.subscriptionReference); continue;
        }
        const subscription = await owned.paymentProvider.retrieveSubscription(target.subscriptionReference, {includeRecoveryDetails: true});
        if (subscription.subscriptionReference !== target.subscriptionReference
          || subscription.customerReference !== owned.customer.customerReference) throw Error("Unexpected subscription owner.");
        if (!canChangeCard(subscription)) {result.skipped.push(target.subscriptionReference); continue;}
        if (this.dependencies.canChangeRecoveryCard && !await this.dependencies.canChangeRecoveryCard({studentId: target.studentId,
          mode: owned.mode, subscriptionReference: target.subscriptionReference})) {result.skipped.push(target.subscriptionReference); continue;}
        if (subscription.defaultPaymentMethodReference !== method.paymentMethodReference || subscription.saveDefaultPaymentMethod !== "on_subscription") {
          const age = this.now().getTime() - intent.createdAt?.getTime();
          if (!Number.isFinite(age) || age < -300000 || age > 23 * 60 * 60 * 1000) throw Error("Card setup expired.");
          await owned.paymentProvider.updateSubscriptionPaymentMethod({subscriptionReference: target.subscriptionReference,
            paymentMethodReference: method.paymentMethodReference, setupIntentReference: intent.setupIntentReference});
          const verified = await owned.paymentProvider.retrieveSubscription(target.subscriptionReference, {includeRecoveryDetails: true});
          if (verified.subscriptionReference !== target.subscriptionReference || verified.customerReference !== owned.customer.customerReference
            || verified.defaultPaymentMethodReference !== method.paymentMethodReference) throw Error("Card update could not be confirmed.");
        }
        result.updated.push(target.subscriptionReference);
        if (this.dependencies.onCardUpdated) await this.dependencies.onCardUpdated({mode: owned.mode,
          guardianId: owned.internalReference, customerReference: owned.customer.customerReference, ...target}, method);
      } catch {result.failed.push(target.subscriptionReference);}
    }
    const details = await this.getDetails(input);
    return withMetadata({...details, cardUpdateResult: result}, details[require("../../syllabus_subscription/domain/subscription_payment_view").metadata]?.subscription);
  }

}

module.exports = {ManageStripeSubscriptionPayment};
