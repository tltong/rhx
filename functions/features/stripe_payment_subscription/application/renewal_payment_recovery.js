const {randomUUID} = require("node:crypto");
const {loadOwnedStripeSubscription, paymentError} = require("./load_owned_subscription_invoice");
const {quote} = require("./manage_guardian_subscriptions");
const {hash, hydrate, error, manualReason, recoveryProjection, retryProjection, failAttempt,
  addBillingMonths, RECOVERY_START_AT} = require("../../syllabus_subscription/domain/renewal_episode");
const live = a => a && !["failed", "cancelled", "completed"].includes(a.state);
const iso = value => JSON.parse(JSON.stringify(value));
class RenewalPaymentRecovery {
  constructor(dependencies) {this.d = dependencies; this.repo = dependencies.repository; this.now = dependencies.now || (() => new Date());}
  async owned(input, loaded = null) {
    const owned = loaded || await loadOwnedStripeSubscription(this.d, input);
    if (["canceled", "incomplete_expired"].includes(owned.subscription.status)) return null;
    const link = await this.d.getGuardianStudentLink({guardianId: owned.internalReference, studentId: owned.record.studentId});
    if (!link || !(link.isActive || link.state === "active")) throw paymentError("permission-denied", "Choose a currently linked student.");
    const recovery = owned.student?.renewalRecovery;
    if (recovery?.version !== 2 || recovery.paymentMode !== owned.mode
      || recovery.paymentSubscriptionReference !== owned.subscriptionReference) {
      const invoiceReference = owned.subscription.latestInvoiceReference;
      if (invoiceReference) {
        const context = await owned.paymentProvider.retrieveInvoicePaymentContext(invoiceReference, {includeBillingDetails: true});
        if (context.customerReference !== owned.customer.customerReference || context.subscriptionReference !== owned.subscriptionReference) throw error("Unexpected renewal invoice owner.");
        const failed = context.paymentStatus === "requires_action" || context.failureCode
          || ["past_due", "unpaid"].includes(owned.subscription.status);
        if (context.billingReason === "subscription_cycle" && context.invoiceStatus === "open"
          && context.invoiceCreatedAt >= RECOVERY_START_AT && failed && !["processing", "succeeded"].includes(context.paymentStatus)) {
          const firstFailure = context.invoiceFinalizedAt || context.invoiceCreatedAt;
          const observed = await this.handleStripeEvent({mode: owned.mode, observationOnly: true, event: {
            id: "backend_observed_" + invoiceReference, type: "invoice.payment_failed", created: Math.floor(+firstFailure / 1000),
            livemode: owned.mode === "prod", data: {object: {object: "invoice", id: invoiceReference,
              customer: owned.customer.customerReference, subscription: owned.subscriptionReference}},
          }});
          if (observed.handled) return this.owned(input);
        }
      }
      return null;
    }
    const e = await this.repo.get({studentId: owned.record.studentId, id: recovery.episodeReference});
    if (!e || e.guardianId !== owned.internalReference || e.customerReference !== owned.customer.customerReference) throw error("Recovery ownership is unavailable.");
    if (e.state === "completed" && owned.selectedInvoiceReference !== e.completedInvoiceReference) return null;
    if (input.invoiceReference && ![e.originalInvoiceReference, e.completedInvoiceReference, e.attempt?.invoiceReference].includes(input.invoiceReference)) {
      throw error("This invoice is not the current renewal.", "not-found");
    }
    return {...owned, episode: e};
  }
  async handleStripeEvent({mode, event, observationOnly = false}) {
    if (!["test", "prod"].includes(mode) || event.livemode !== (mode === "prod")) throw error("Unexpected Stripe event mode.");
    if (!event.id || !Number.isSafeInteger(event.created)) throw error("Stripe event identity is missing.");
    const object = event.data?.object;
    const supported = ["invoice.payment_failed", "invoice.payment_action_required", "invoice.paid", "invoice.updated", "invoice.voided",
      "customer.subscription.paused", "customer.subscription.resumed", "customer.subscription.updated", "customer.subscription.deleted",
      "payment_intent.succeeded", "payment_intent.payment_failed", "payment_intent.canceled", "payment_intent.processing"].includes(event.type);
    if (!supported || !object) return {handled: false};
    const ref = value => typeof value === "object" ? value?.id : value;
    const subscriptionReference = object.object === "subscription" ? object.id
      : ref(object.parent?.subscription_details?.subscription || object.subscription) || object.metadata?.rhx_subscription;
    const customerReference = ref(object.customer);
    if (!subscriptionReference || !customerReference) return {handled: false};
    const [registered, customer] = await Promise.all([
      this.d.getSubscriptionRecord({mode, customerReference, subscriptionReference}),
      this.d.getCustomerRecordByReference({mode, customerReference})]);
    if (!registered?.studentId || !customer) return {handled: false};
    const student = await this.d.getStudentSubscription(registered.studentId), root = student?.renewalRecovery;
    const {paymentProvider} = await this.d.createPaymentProviderForContext({providerName: "stripe", mode});
    if (root?.version === 2 && root.paymentMode === mode && root.paymentSubscriptionReference === subscriptionReference) {
      const e = await this.repo.get({studentId: registered.studentId, id: root.episodeReference});
      const matches = e && (object.id === e.originalInvoiceReference || object.metadata?.rhx_episode === e.id
        || object.object === "subscription" && e.state !== "completed");
      if (matches) {
        if (object.object === "subscription" && e.state === "completed") {
          const current = await paymentProvider.retrieveSubscription(subscriptionReference, {includeRecoveryDetails: true});
          if (current.customerReference !== customerReference) throw error("Unexpected lifecycle customer.");
          await this.repo.lifecycle(e, current.status);
          return {handled: true, eventType: event.type, mode, subscriptionReference};
        }
        if (object.object === "payment_intent" && event.type === "payment_intent.succeeded") {
          await this.repo.mutate(e, current => {
            if (current.attempt?.paymentIntentReference !== object.id || object.metadata?.rhx_attempt !== current.attempt.id) return null;
            current.attempt.successEventAt ||= new Date(event.created * 1000); return current;
          });
        }
        if (!observationOnly) await this.run(e);
        return {handled: true, eventType: event.type, mode, subscriptionReference};
      }
    }
    if (!["invoice.payment_failed", "invoice.payment_action_required"].includes(event.type)
      || object.object !== "invoice") return {handled: false};
    const context = await paymentProvider.retrieveInvoicePaymentContext(object.id, {includeBillingDetails: true});
    if (context.subscriptionReference !== subscriptionReference || context.customerReference !== customerReference) throw error("Unexpected failed invoice owner.");
    // Old invoices and already stored legacy retry plans are deliberately left alone.
    if (context.billingReason !== "subscription_cycle") return {handled: false};
    const existingInvoice = await this.d.getInvoiceRecord({studentId: registered.studentId, paymentProvider: "stripe", paymentMode: mode,
      paymentSubscriptionReference: subscriptionReference, invoiceReference: object.id});
    if (context.invoiceStatus !== "open"
      || !context.invoiceCreatedAt || context.invoiceCreatedAt < RECOVERY_START_AT
      || ["processing", "succeeded"].includes(context.paymentStatus)
      || existingInvoice?.renewalRecovery || existingInvoice?.renewalRetry || existingInvoice?.recoveryEpisodeReference) return {handled: false, legacyExcluded: true};
    const subscription = await paymentProvider.retrieveSubscription(subscriptionReference, {includeRecoveryDetails: true});
    if (subscription.customerReference !== customerReference || subscription.latestInvoiceReference !== object.id) return {handled: false, legacyExcluded: true};
    if (["canceled", "incomplete_expired"].includes(subscription.status) || student?.subscriptionCancellation
      && student.subscriptionCancellation.paymentMode === mode
      && student.subscriptionCancellation.paymentSubscriptionReference === subscriptionReference) return {handled: false, legacyExcluded: true};
    await paymentProvider.disableInvoiceAutomaticCollection(object.id);
    const verified = await paymentProvider.retrieveInvoicePaymentContext(object.id, {includeBillingDetails: true});
    if (verified.invoiceStatus === "paid") return {handled: false};
    const policy = (await this.d.getPaymentConfig()).renewalRetryPolicy;
    if (!policy?.gracePeriodHours) throw error("Renewal recovery configuration is unavailable.");
    const now = this.now(), firstFailedAt = new Date(Math.min(event.created * 1000, +now));
    const reason = manualReason(context.failureCode || (context.paymentStatus === "requires_action" ? "authentication_required" : null));
    const nextRetryAt = reason || !policy.maxRetries ? null : new Date(+firstFailedAt + policy.intervalHours * 3600000);
    const e = await this.repo.initialize({studentId: registered.studentId, guardianId: customer.internalReference,
      customerReference, subscriptionReference, mode, originalInvoiceReference: object.id,
      subscriptionRegisteredAt: registered.createdAt?.toDate?.() || registered.createdAt || subscription.subscriptionStartDate,
      originalPlanId: require("./billing_plan_version").subscriptionBillingRecord(registered, subscription).planId,
      originalInvoice: {invoiceCreatedAt: context.invoiceCreatedAt, amountDue: context.amountDue ?? context.amountRemaining,
        currencyExponent: context.currencyExponent ?? 2, billingPeriodStart: context.billingPeriodStart || null,
        billingPeriodEnd: context.billingPeriodEnd || null, attemptCount: context.attemptCount || 1},
      currency: context.currency, policy: {...policy}, firstFailedAt,
      graceUntil: new Date(+firstFailedAt + policy.gracePeriodHours * 3600000), state: "pending_hold",
      attemptsMade: 0, reason: reason || context.failureCode || "payment_failed", automaticStoppedReason: reason,
      blockedPaymentMethodReference: context.failedPaymentMethodReference || subscription.defaultPaymentMethodReference || null,
      nextRetryAt, pausedConfirmed: false, originalDropped: false, expiryApplied: false,
      attempt: null, requests: {}, createdAt: now, updatedAt: now});
    if (!e) return {handled: false, legacyExcluded: true};
    await this.run(e, observationOnly ? {action: "observe"} : null);
    return {handled: true, eventType: event.type, mode, subscriptionReference, paymentState: "failed"};
  }
  async provider(e) {
    return (await this.d.createPaymentProviderForContext({providerName: "stripe", mode: e.mode})).paymentProvider;
  }
  async cardChangeAllowed({studentId, mode, subscriptionReference}) {
    const root = (await this.d.getStudentSubscription(studentId))?.renewalRecovery;
    if (root?.version !== 2 || root.paymentMode !== mode || root.paymentSubscriptionReference !== subscriptionReference) return true;
    const e = await this.repo.get({studentId, id: root.episodeReference});
    return !!e && !live(e.attempt) && !e.leaseToken && e.state !== "manual_review";
  }
  async terms(owned, input) {
    let terms, planId = input.planId || owned.record.planId;
    if (input.quoteReference || planId !== owned.record.planId) {
      const profile = await this.d.getStudentById(owned.record.studentId);
      terms = profile?.country && await this.d.getSubscriptionPlanBillingTerms({country: profile.country, planId});
      if (!terms || input.quoteReference !== quote(profile.country, planId, terms, owned.mode)) throw error("Plan price changed. Refresh and review before paying.");
    } else terms = {amount: owned.record.amount, currency: owned.record.currency, interval: owned.record.interval,
      intervalCount: owned.record.intervalCount, stripeProductName: owned.record.stripeProductName || planId};
    const durationMonths = terms.interval === "month" ? terms.intervalCount : terms.interval === "year" ? terms.intervalCount * 12 : 0;
    if (!Number.isSafeInteger(terms.amount) || terms.amount <= 0 || durationMonths < 1 || durationMonths > 24
      || terms.currency.toLowerCase() !== owned.episode.currency.toLowerCase()) throw error("This plan cannot be used to restart this subscription.");
    const priceReference = input.quoteReference || planId !== owned.record.planId
      ? await owned.paymentProvider.resolveSubscriptionPrice(terms) : owned.subscription.currentPriceReference;
    if (!priceReference) throw error("The selected subscription price is unavailable.");
    return {planId, terms: {...terms, currency: terms.currency.toLowerCase()}, durationMonths, priceReference,
      previousPriceReference: owned.subscription.currentPriceReference};
  }
  async command(input) {
    let owned = await this.owned(input);
    if (!owned) throw error("No current renewal recovery is available.");
    const action = input.action;
    if (!["retry", "new_card", "cancel_payment", "cancel_renewal"].includes(action)) throw error("Unknown recovery action.", "invalid-argument");
    if (owned.episode.state === "manual_review") throw error("Contact support to review this payment before another attempt.");
    if (["retry", "new_card"].includes(action)) {
      if (action === "retry" && owned.episode.reason === "new_card_required"
        && owned.subscription.defaultPaymentMethodReference === owned.episode.blockedPaymentMethodReference) {
        throw error("This card cannot be retried. Use a new card.");
      }
      if (typeof input.idempotencyReference !== "string" || !input.idempotencyReference.trim() || input.idempotencyReference.length > 500) {
        throw error("A payment attempt reference is required.", "invalid-argument");
      }
      const plan = await this.terms(owned, input);
      const request = hash(["manual", input.idempotencyReference.trim()]);
      await this.run(owned.episode, {action, request, plan,
        paymentMethodReference: action === "retry" ? owned.subscription.defaultPaymentMethodReference : null});
    } else await this.run(owned.episode, {action});
    return this.details(await this.owned({...input, invoiceReference: undefined}), false);
  }
  async run(identity, command = null) {
    const token = randomUUID();
    let e = await this.repo.mutate(identity, (current, now) => {
      if (current.state === "completed" || current.leaseToken && current.leaseUntil > now) return null;
      current.leaseToken = token; current.leaseUntil = new Date(+now + 300000); return current;
    });
    if (!e) return;
    if (e.cancellationRequestedAt) command = {action: "cancel_renewal"};
    const save = async change => {
      const saved = await this.repo.mutate(e, current => {
        if (current.leaseToken !== token) return null;
        change(current); return current;
      });
      if (!saved) throw error("Recovery operation was superseded.");
      e = saved;
    };
    try {
      // A status-repair observation may establish the billing hold, but must
      // never create or confirm an in-flight payment owned by another worker.
      if (command?.action === "observe" && live(e.attempt)) return;
      if (e.state === "manual_review") {
        await save(current => {current.nextRetryAt = null; if (this.now() >= current.graceUntil) current.expiryApplied = true;});
        return;
      }
      const p = await this.provider(e), op = (name, extras = {}) => p.renewalEpisodeOperation(name, {...e, ...extras});
      if (!e.pausedConfirmed) {
        await op("ensurePaused");
        await save(current => {current.pausedConfirmed = true; current.lastErrorCode = null;
          current.state = this.now() >= current.graceUntil ? "suspended" : "held";});
      }
      const dropOriginal = async () => {
        if (e.originalDropped) return true;
        const result = await op("dropInvoice", {targetInvoiceReference: e.originalInvoiceReference});
        if (result.paid) throw error("A payment arrived on the original invoice; billing review is required before another charge.");
        if (!result.dropped) return false;
        await save(current => {current.originalDropped = true;}); return true;
      };
      const closeAttempt = async (reason, cancelled = false) => {
        if (e.attempt?.paymentIntentReference) {
          const result = await op("cancelPayment");
          if (!result.cancelled) return false;
        }
        if (e.attempt?.invoiceReference) {
          const result = await op("dropInvoice", {targetInvoiceReference: e.attempt.invoiceReference});
          if (!result.dropped) return false;
        }
        await save(current => {
          if (cancelled) {current.attempt.state = "cancelled"; current.attempt.finishedAt = this.now(); current.state = this.now() >= current.graceUntil ? "suspended" : "held";}
          else failAttempt(current, reason, this.now());
          current.requests[current.attempt.request] = current.attempt.state;
        });
        return true;
      };
      const reconcileAttempt = async () => {
        if (!live(e.attempt)) return;
        if (!e.attempt.invoiceReference) {
          if (this.now() - e.attempt.createdAt >= 23 * 3600000) throw error("An interrupted invoice creation needs billing review.");
          const invoice = await op("createDraft"); await save(current => Object.assign(current.attempt, invoice));
        }
        if (!e.attempt.paymentIntentReference) {
          if (this.now() - e.attempt.createdAt >= 23 * 3600000) throw error("An interrupted payment creation needs billing review.");
          const payment = await op("createPayment"); await save(current => Object.assign(current.attempt, payment));
        }
        let result = await op("payment");
        if (result.status === "requires_confirmation" && ["cancel_payment", "cancel_renewal"].includes(command?.action)) return;
        if (result.status === "requires_confirmation" && e.attempt.paymentMethodReference) {
          if (this.now() - e.attempt.createdAt >= 23 * 3600000) throw error("The unfinished payment must be cancelled before trying again.");
          result = await op("confirm");
        }
        if (result.status === "succeeded") {
          if (!result.paidAt && !e.attempt.paidAt) {await save(current => {current.attempt.state = "processing";}); return;}
          await save(current => {
            const a = current.attempt; a.paidAt ||= result.paidAt; a.paidThrough ||= addBillingMonths(a.paidAt, a.durationMonths);
            a.paidPaymentMethodReference = result.paymentMethodReference; a.state = "settling";
            current.paidAt = a.paidAt; current.paidThrough = a.paidThrough; current.state = "pending_reset";
          });
          await op("settleInvoice");
          await this.d.applyRecoveredPlan({mode: e.mode, customerReference: e.customerReference,
            subscriptionReference: e.subscriptionReference, studentId: e.studentId, planId: e.attempt.planId,
            terms: e.attempt.terms, priceReference: e.attempt.priceReference, previousPriceReference: e.attempt.previousPriceReference,
            effectiveAt: e.attempt.paidAt});
          await op("resumePrepaid");
          await save(current => {
            current.attempt.state = "completed"; current.state = "completed"; current.completedAt = this.now();
            current.completedInvoiceReference = current.attempt.invoiceReference; current.nextRetryAt = null;
            current.requests[current.attempt.request] = "completed"; current.lastErrorCode = null;
          });
        } else if (result.status === "processing") await save(current => {current.attempt.state = "processing"; current.state = "pending_payment";});
        else if (result.status === "requires_action") {
          if (e.attempt.kind === "automatic") await closeAttempt("authentication_required");
          else await save(current => {current.attempt.state = "requires_action"; current.state = "pending_payment";});
        } else if (result.status === "requires_payment_method" && e.attempt.methodChoice === "new_card" && !result.failureCode) {
          await save(current => {current.attempt.state = "awaiting_card"; current.state = "pending_payment";});
        } else if (result.status === "canceled") await closeAttempt("payment_cancelled", true);
        else await closeAttempt(result.failureCode || "payment_failed");
      };
      await reconcileAttempt();
      if (e.state === "completed") return;
      if (command?.action === "cancel_payment" || command?.action === "cancel_renewal") {
        if (live(e.attempt) && !await closeAttempt("payment_cancelled", true)) return;
        if (command.action === "cancel_renewal") {
          if (!await dropOriginal()) return;
          await save(current => {current.cancelledAt ||= this.now(); current.state = "cancelled"; current.reason = "guardian_cancelled"; current.nextRetryAt = null;});
        }
      }
      if (this.now() >= e.graceUntil) {
        if (!await dropOriginal()) return;
        await save(current => {current.expiryApplied = true; current.nextRetryAt = null;
          if (!live(current.attempt) && !current.cancelledAt) current.state = "suspended";});
      } else if (e.automaticStoppedReason && !e.originalDropped && !await dropOriginal()) return;
      if (live(e.attempt) || ["cancel_payment", "cancel_renewal"].includes(command?.action)) return;
      const automatic = !command && !e.cancelledAt && !e.automaticStoppedReason && e.nextRetryAt && this.now() >= e.nextRetryAt
        && this.now() < e.graceUntil && e.attemptsMade < e.policy.maxRetries;
      if (!automatic && !["retry", "new_card"].includes(command?.action)) return;
      if (!await dropOriginal()) return;
      let plan = command?.plan, paymentMethodReference = command?.paymentMethodReference;
      if (automatic) {
        const record = await this.d.getSubscriptionRecord({mode: e.mode, customerReference: e.customerReference, subscriptionReference: e.subscriptionReference});
        const subscription = await p.retrieveSubscription(e.subscriptionReference, {includeRecoveryDetails: true});
        const customer = await this.d.getCustomerRecordByReference({mode: e.mode, customerReference: e.customerReference});
        if (!record || record.studentId !== e.studentId || customer?.internalReference !== e.guardianId) throw error("Subscription registration changed.");
        const link = await this.d.getGuardianStudentLink({guardianId: e.guardianId, studentId: e.studentId});
        if (!link || !(link.isActive || link.state === "active")) {
          await save(current => {current.nextRetryAt = null; current.automaticStoppedReason = "guardian_link_inactive"; current.reason = "guardian_link_inactive";}); return;
        }
        plan = await this.terms({record: require("./billing_plan_version").subscriptionBillingRecord(record, subscription), subscription,
          recordOriginal: record, paymentProvider: p, episode: e, mode: e.mode}, {});
        paymentMethodReference = subscription.defaultPaymentMethodReference;
      }
      if (command?.action === "retry" || automatic) {
        const card = paymentMethodReference && await p.retrievePaymentMethod(paymentMethodReference);
        if (!card || card.customerReference !== e.customerReference || card.type !== "card") {
          await save(current => {current.automaticStoppedReason = "new_card_required"; current.reason = "new_card_required"; current.nextRetryAt = null;}); return;
        }
      }
      const request = automatic ? hash(["automatic", e.attemptsMade + 1]) : command.request;
      if (e.requests[request]) return; // A replay of a finished request never creates another charge.
      if (Object.keys(e.requests).length >= 1000) throw error("Recovery attempt history needs billing review.");
      await save(current => {
        current.attempt = {id: hash([current.id, request]), request, kind: automatic ? "automatic" : "manual",
          methodChoice: command?.action === "new_card" ? "new_card" : "current_card", state: "creating",
          ...plan, paymentMethodReference: paymentMethodReference || null, createdAt: this.now(),
          currencyExponent: ["isk", "ugx"].includes(plan.terms.currency) ? 2 : new Intl.NumberFormat("en", {style: "currency", currency: plan.terms.currency}).resolvedOptions().maximumFractionDigits};
        current.requests[request] = "pending"; current.state = "pending_payment";
        if (automatic) {current.attemptsMade++; current.lastAttemptAt = this.now(); current.nextRetryAt = null;}
      });
      await reconcileAttempt();
    } catch (err) {
      await save(current => {
        current.lastErrorCode = err.code === "failed-precondition" || err.type === "StripeInvalidRequestError" ? "billing_review_required" : "payment_result_unknown";
        if (current.lastErrorCode === "billing_review_required") {current.state = "manual_review"; current.nextRetryAt = null;}
      });
      if (command) throw err;
    } finally {
      await this.repo.mutate(e, current => {
        if (current.leaseToken !== token) return null;
        current.leaseToken = null; current.leaseUntil = null; return current;
      });
      if (this.d.onChanged) await this.d.onChanged(e);
    }
  }
  async details(owned, refresh = true, includeCardTargets = true) {
    if (!owned) return null;
    if (refresh && owned.episode.state !== "completed") await this.run(owned.episode, {action: "refresh"});
    const e = await this.repo.get(owned.episode), a = e.attempt;
    if (e.state === "completed" && owned.episode.state !== "completed") {
      owned = {...owned, subscription: await owned.paymentProvider.retrieveSubscription(e.subscriptionReference, {includeRecoveryDetails: true})};
    }
    let payment = null, card = null;
    if (live(a) && a.paymentIntentReference) payment = await owned.paymentProvider.renewalEpisodeOperation("payment", e);
    if (owned.subscription.defaultPaymentMethodReference) {
      try {
        const method = await owned.paymentProvider.retrievePaymentMethod(owned.subscription.defaultPaymentMethodReference);
        if (method.customerReference === e.customerReference && method.type === "card") card = method.card;
      } catch (err) {if (err.code !== "resource_missing") throw err;}
    }
    const pending = live(a), complete = e.state === "completed", review = e.state === "manual_review";
    const active = pending && !["requires_action", "awaiting_card"].includes(a.state);
    const state = complete ? "paid" : pending ? active ? "processing" : a.state === "awaiting_card" ? "unpaid" : "authentication_required" : "failed";
    const profile = await this.d.getStudentById(e.studentId);
    let cardChangeTargets = [];
    if (includeCardTargets && !pending && !review && this.d.listCardTargets) {
      try {cardChangeTargets = await this.d.listCardTargets(owned);} catch { /* Single-subscription card changes remain available. */ }
    }
    const cardChanged = owned.subscription.defaultPaymentMethodReference !== e.blockedPaymentMethodReference;
    const canRetry = !complete && !pending && !e.leaseToken && !review && !!card && (e.reason !== "new_card_required" || cardChanged);
    const current = (pending || complete) && a ? a.terms : owned.record;
    return require("../../syllabus_subscription/domain/subscription_payment_view").withMetadata(iso({subscriptionReference: e.subscriptionReference, subscriptionStatus: complete ? owned.subscription.status : "paused",
      applicationStatus: complete || this.now() < e.graceUntil ? "active" : "suspended",
      renewalRecovery: recoveryProjection(e), renewalRetry: retryProjection(e), currentCard: card,
      canChangeCard: !pending && !review,
      canChangeAllStudents: cardChangeTargets.length > 1 && cardChangeTargets.some(t => t.subscriptionReference === e.subscriptionReference), cardChangeTargets,
      nextChargeAt: complete && !owned.subscription.cancelAtPeriodEnd && ["active", "trialing"].includes(owned.subscription.status) ? e.paidThrough : null,
      cancelAtPeriodEnd: owned.subscription.cancelAtPeriodEnd,
      studentId: e.studentId, studentName: profile?.name || e.studentId,
      planId: complete ? a.planId : owned.record.planId, paymentState: state, linkedInvoiceIsCurrent: true,
      canCancelPendingPayment: pending && !e.leaseToken && !review,
      canCancelRenewal: !complete && !e.cancelledAt && !review,
      renewalCancelled: !!e.cancelledAt, recoveryPending: pending || !!e.leaseToken,
      renewal: {subscriptionReference: e.subscriptionReference, invoiceReference: e.originalInvoiceReference,
        attemptInvoiceReference: a?.invoiceReference || null, invoiceStatus: complete ? "paid" : pending ? "draft" : e.originalDropped ? "void" : "open",
        subscriptionStatus: complete ? "trialing" : "paused", billingReason: "subscription_cycle", paymentState: state,
        action: complete ? "complete" : review ? "unavailable" : pending ? a.state === "requires_action" ? "confirm_payment"
          : a.state === "awaiting_card" ? "enter_new_card" : "wait" : canRetry ? "retry_payment" : "replace_payment_method",
        amountDue: complete ? 0 : current.amount ?? owned.record.amount, currency: (current.currency || e.currency).toLowerCase(),
        amountPaid: complete ? a.terms.amount : 0,
        paymentStatus: payment?.status || null, paymentClientSecret: pending && ["requires_action", "awaiting_card"].includes(a.state) ? payment?.clientSecret || null : null,
        canRetry, canPayWithNewCard: !complete && !review && !e.leaseToken && !active && (!pending || a.state === "awaiting_card"),
        failureCode: e.reason === "new_card_required" ? "expired_card" : e.reason,
        savedCard: card, studentId: e.studentId, planId: (pending || complete) && a ? a.planId : owned.record.planId,
        nextPaymentAttemptAt: e.nextRetryAt || null}}), owned.subscription);
  }
  async getDetails(input, loaded = null) {const owned = await this.owned(input, loaded); return owned && this.details(owned);}
  async action(input) {
    const owned = await this.owned(input); if (!owned) return null;
    return {...(await this.details(owned)).renewal,
      ...(input.invoiceReference ? {invoiceReference: input.invoiceReference} : {})};
  }
  async execute({limit = 25, deadline = Date.now() + 90000} = {}) {
    const rows = await this.repo.listDue({limit});
    let examined = 0, errors = 0;
    for (const row of rows) {
      if (Date.now() >= deadline) break;
      try {await this.run(row); examined++; if ((await this.repo.get(row))?.lastErrorCode) errors++;} catch {errors++;}
    }
    return {examined, errors};
  }
}
module.exports = {RenewalPaymentRecovery};
