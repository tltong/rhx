/**
 * Internal application API:
 * cancelStripeStudentSubscription({internalReference, subscriptionReference})
 *   -> payment details with cancellation.state pending|cancelled and accessUntil.
 *   Cancels Stripe immediately; a verified in-progress payment is reconciled
 *   first. Cancellations and their access deadlines survive request failures.
 * processDueStripeRenewalRetries({limit?}) -> batch counts
 *   Protected scheduler entry; reads snapshotted invoice policy and uses the
 *   recorded provider mode. Automatic payment is off-session and lease guarded.
 *
 * createStripePaymentSubscription({internalReference, studentId,
 *   customerReference, paymentMethodReference, country, planId,
 *   idempotencyReference})
 *   -> Promise<{subscriptionReference, status, paymentClientSecret}>
 * getStripeSubscriptionPaymentAction({
 *   internalReference, subscriptionReference, invoiceReference?})
 *   -> Promise<{action, subscriptionReference, invoiceReference,
 *      paymentStatus, paymentClientSecret, amountDue, currency}>
 * retryStripeSubscriptionInvoicePayment({internalReference,
 *   subscriptionReference, invoiceReference, idempotencyReference})
 *   -> Promise<payment-action DTO with canRetry, savedCard, failureCode>
 *   Verifies ownership and eligibility, selects the saved card on the server,
 *   replaces unpaid v2 renewal invoices with a fresh invoice/payment attempt,
 *   and rechecks Stripe after success or error. Legacy invoice retries retain
 *   their original path. Initial invoices are not retried.
 * processStripeSubscriptionEvent({
 *   mode: "test"|"prod", event: Stripe.Event})
 *   -> Promise<{handled, eventType, mode?, invoiceReference?,
 *      customerReference?, subscriptionReference?, status?, paymentState?,
 *      duplicate?, accessUpdated?, receiptCreated?}>
 *   Processes initial/renewal paid, failed, authentication, invoice retry updates
 *   and subscription lifecycle events through the existing subscription billing API.
 * getStripeSubscriptionPaymentDetails({internalReference, subscriptionReference,
 *   invoiceReference?, refreshFromStripe?: boolean}) -> Promise<stored card,
 *      billing state, deferred renewal action, applicationStatus, retry progress,
 *      syncState>. Default reads use the schema only; explicit refresh verifies
 *      Stripe and repairs the stored view and invoice ledger.
 * createStripeSubscriptionCardSetup({internalReference, subscriptionReference,
 *   idempotencyReference, cardChangeScope?: "subscription"|"all_students"}) -> Promise<{setupIntentReference, clientSecret}>
 * updateStripeSubscriptionPaymentMethod({internalReference, subscriptionReference,
 *   setupIntentReference}) -> Promise<subscription payment details>
 *   Verifies completed off-session setup, owner/mode/purpose, then updates the
 *   subscription default without charging an invoice or replacing checkout identity.
 *
 * This feature verifies guardian/customer/student ownership, resolves trusted
 * plan billing terms, creates the Stripe subscription, initializes its record
 * atomically without replacing webhook state on retries, returns current
 * Stripe checkout details, synchronizes
 * invoice-driven state, links an active paid subscription to its student, and
 * supplies the customer-owned payment action needed by a complete-payment
 * page.
 */
const {
  createPaymentProviderContext,
  createPaymentProviderForContext,
} = require("../payment_factory/payment_factory_module");
const {
  getGuardianStudentLink,
  listActiveGuardianStudentLinks,
} = require("../guardian_student_link/guardian_student_link_module");
const {
  createStripePayment,
} = require("../stripe_payment/stripe_payment_module");
const {
  getCustomerRecordByInternalReference,
  listSubscriptionRecords,
  getSetupIntentRecord,
  getCustomerRecordByReference,
  getSubscriptionRecord,
  initializeSubscriptionRecord,
  writeSetupIntentRecord,
  writePaymentMethodRecord,
  claimSubscriptionPlanChange, finishSubscriptionPlanChange,
  applyRecoveredPlan,
} = require("../stripe_customer/stripe_customer_module");
const {
  getSubscriptionPlanBillingTerms,
  listSubscriptionPlanChoices,
} = require("../syllabus_subscription/subscription_plan_module");
const {
  getStudentSubscription,
  createStudentSubscription,
} = require("../syllabus_subscription/student_subscription_module");
const {initializeInvoiceRecord, recordInvoicePaymentEvent} =
  require("../syllabus_subscription/subscription_billing_module");
const {listDueRenewalRetries, claimRenewalRetry, beginRenewalRetryAttempt, finishRenewalRetry, getInvoiceRecord} =
  require("../syllabus_subscription/subscription_billing_module");
const {getStudentById} = require("../student/student_module");
const {getPaymentConfig} = require("../payment/payment_module");
const {RenewalPaymentRecovery} = require("./application/renewal_payment_recovery");
const {renewalEpisodeRepository} = require("../syllabus_subscription/subscription_billing_module");
const {subscriptionCancellationRepository} = require("../syllabus_subscription/subscription_billing_module");
const {subscriptionPaymentViewRepository} = require("../syllabus_subscription/subscription_billing_module");
const {SubscriptionPaymentViews} = require("./application/subscription_payment_views");
const {ReadStoredSubscriptionPayments} = require("./application/read_stored_subscription_payments");
// Repair jobs are durable. A projection failure must not turn a confirmed
// payment/card/cancellation into an apparently failed command.
const notifyPaymentView = async identity => {
  try {await paymentViews.enqueueIdentity(identity);} catch (error) {
    require("firebase-functions/logger").warn("Subscription view update queued by next ledger read.", {code: error.code || "unavailable"});
  }
};
const {CancelStudentSubscription} = require("./application/cancel_student_subscription");
const renewalPaymentRecovery = new RenewalPaymentRecovery({repository: renewalEpisodeRepository,
  onChanged: notifyPaymentView,
  listCardTargets: owned => managePayment.cardTargets(owned),
  createPaymentProviderContext, createPaymentProviderForContext, getGuardianStudentLink,
  getSubscriptionRecord, getCustomerRecordByReference, getCustomerRecordByInternalReference,
  getStudentSubscription, getInvoiceRecord, getPaymentConfig, getStudentById, getSubscriptionPlanBillingTerms,
  applyRecoveredPlan});
const {ReconcileRenewalRecovery} = require("./application/reconcile_renewal_recovery");
const {listDueRenewalRecoveries, claimRenewalRecovery, finishRenewalRecovery} =
  require("../syllabus_subscription/subscription_billing_module");
const {ProcessDueRenewalRetries} = require("./application/process_due_renewal_retries");
const {
  CreateStripePaymentSubscription,
} = require("./application/create_stripe_payment_subscription");
const {
  GetStripeSubscriptionPaymentAction,
} = require("./application/get_stripe_subscription_payment_action");
const {RetryStripeSubscriptionInvoicePayment} =
  require("./application/retry_stripe_subscription_invoice_payment");
const {ManageStripeSubscriptionPayment} =
  require("./application/manage_stripe_subscription_payment");
const {ManageGuardianSubscriptions} = require("./application/manage_guardian_subscriptions");
const {createStripePaymentCustomer} = require("../stripe_payment_customer/stripe_payment_customer_module");
const {getStudentSubscriptionCheckout, claimStudentSubscriptionCheckout, completeStudentSubscriptionCheckout} =
  require("../syllabus_subscription/student_checkout_module");
const {
  ProcessStripeSubscriptionEvent,
} = require("./application/process_stripe_subscription_event");

const recoveryController = new ReconcileRenewalRecovery({createPaymentProviderForContext,
  onChanged: notifyPaymentView,
  getCustomerRecordByInternalReference, getSubscriptionRecord, getInvoiceRecord, recordInvoicePaymentEvent, getPaymentConfig,
  listDueRenewalRecoveries, claimRenewalRecovery, finishRenewalRecovery});
const reconcileRenewalRecovery = input => recoveryController.process(input);
const observeRecoveredPayment = input => recoveryController.recordPaid(input);
const ensureRenewalRecovery = async () => null;

const createStripePaymentSubscriptionUseCase =
  new CreateStripePaymentSubscription({
    createPaymentProviderContext,
    getCustomerRecordByReference,
    getGuardianStudentLink,
    getStudentSubscription,
    getSubscriptionPlanBillingTerms,
    initializeSubscriptionRecord,
    initializeInvoiceRecord,
    getStudentSubscriptionCheckout, claimStudentSubscriptionCheckout, completeStudentSubscriptionCheckout,
    listSubscriptionRecords,
  });
const guardianSubscriptions = new ManageGuardianSubscriptions({createPaymentProviderContext,
  readStoredOptions: input => storedPayments.getOptions(input),
  getGuardianStudentLink, listActiveGuardianStudentLinks, getStudentById, getStudentSubscription,
  createStudentSubscription, getCustomerRecordByInternalReference, listSubscriptionRecords,
  listSubscriptionPlanChoices, getSubscriptionPlanBillingTerms, createStripePaymentCustomer,
  getStudentSubscriptionCheckout,
  claimSubscriptionPlanChange, finishSubscriptionPlanChange,
  createStripePaymentSubscription: input => createStripePaymentSubscriptionUseCase.execute(input)});
const processStripeSubscriptionEventUseCase =
  new ProcessStripeSubscriptionEvent({
    createStripePayment,
    getSubscriptionRecord,
    getCustomerRecordByReference,
    recordInvoicePaymentEvent,
    writePaymentMethodRecord,
    getPaymentConfig, getStudentSubscription, getInvoiceRecord, reconcileRenewalRecovery,
  });
const getStripeSubscriptionPaymentActionUseCase =
  new GetStripeSubscriptionPaymentAction({
    createPaymentProviderContext,
    getCustomerRecordByInternalReference,
    getSubscriptionRecord, getStudentSubscription, observeRecoveredPayment, ensureRenewalRecovery,
  });
const retryStripeSubscriptionInvoicePaymentUseCase =
  new RetryStripeSubscriptionInvoicePayment({
    createPaymentProviderContext,
    getCustomerRecordByInternalReference,
    getSubscriptionRecord, getStudentSubscription, observeRecoveredPayment, ensureRenewalRecovery,
  });
const managePayment = new ManageStripeSubscriptionPayment({
  onCardUpdated: async (scope, method) => {
    try {await subscriptionPaymentViewRepository.patchCard(scope, method);} catch (error) {
      await notifyPaymentView(scope);
    }
  },
  canChangeRecoveryCard: input => renewalPaymentRecovery.cardChangeAllowed(input),
  getRenewalRecoveryDetails: (input, loaded) => renewalPaymentRecovery.getDetails(input, loaded),
  createPaymentProviderContext, getCustomerRecordByInternalReference,
  listSubscriptionRecords, getSetupIntentRecord, getGuardianStudentLink, getStudentById, observeRecoveredPayment, ensureRenewalRecovery,
  getSubscriptionRecord, writeSetupIntentRecord, writePaymentMethodRecord, getStudentSubscription, getInvoiceRecord,
});
const dueRenewalRetries = new ProcessDueRenewalRetries({createPaymentProviderForContext,
  onChanged: notifyPaymentView,
  getCustomerRecordByInternalReference, getSubscriptionRecord, listDueRenewalRetries,
  claimRenewalRetry, beginRenewalRetryAttempt, finishRenewalRetry, recordInvoicePaymentEvent, getInvoiceRecord, getStudentSubscription, reconcileRenewalRecovery, ensureRenewalRecovery});

async function createStripePaymentSubscription(input) {
  const result = await createStripePaymentSubscriptionUseCase.execute(input);
  await paymentViews.queue({...input, subscriptionReference: result.subscriptionReference}, "subscription_created");
  return result;
}

async function processStripeSubscriptionEvent(input) {
  const result = await renewalPaymentRecovery.handleStripeEvent(input);
  const processed = result.handled || result.legacyExcluded ? {...result, handled: true}
    : await processStripeSubscriptionEventUseCase.execute(input);
  if (processed.handled) {
    const identity = await paymentViews.eventIdentity(input);
    if (identity) {
      const queued = await paymentViews.enqueueIdentity(identity, "webhook");
      if (queued) {
        try {await paymentViews.refresh(queued);} catch (error) {
          require("firebase-functions/logger").warn("Webhook payment view awaits reconciliation.", {code: error.code || "unavailable"});
        }
      }
    }
  }
  return processed;
}

async function getStripeSubscriptionPaymentAction(input) {
  await cancellation.requirePaymentAllowed(input);
  const result = await renewalPaymentRecovery.action(input);
  const action = result || await getStripeSubscriptionPaymentActionUseCase.execute(input);
  try {await paymentViews.captureAction(input, action);} catch {await notifyPaymentView(await paymentViews.scope(input));}
  return action;
}

async function retryStripeSubscriptionInvoicePayment(input) {
  await cancellation.requirePaymentAllowed(input);
  const owned = await renewalPaymentRecovery.owned(input);
  if (owned) return {...(await renewalPaymentRecovery.command({...input, action: "retry"})).renewal,
    ...(input.invoiceReference ? {invoiceReference: input.invoiceReference} : {})};
  return retryStripeSubscriptionInvoicePaymentUseCase.execute(input);
}

const cancellation = new CancelStudentSubscription({repository: subscriptionCancellationRepository,
  onChanged: notifyPaymentView,
  episodeRepository: renewalEpisodeRepository, recovery: renewalPaymentRecovery,
  createPaymentProviderContext, createPaymentProviderForContext, getCustomerRecordByInternalReference,
  getSubscriptionRecord, getStudentSubscription, getGuardianStudentLink,
  reconcileLegacyPaid: async r => {
    const owned = await require("./application/load_owned_subscription_invoice").loadOwnedStripeSubscription({
      createPaymentProviderContext: () => createPaymentProviderForContext({providerName: "stripe", mode: r.mode}),
      getCustomerRecordByInternalReference, getSubscriptionRecord, getStudentSubscription},
    {internalReference: r.guardianId, subscriptionReference: r.subscriptionReference});
    const root = owned.student?.renewalRecovery;
    if (!root || root.version === 2 || root.state === "completed" || root.paymentSubscriptionReference !== r.subscriptionReference) return true;
    const context = await owned.paymentProvider.retrieveInvoicePaymentContext(owned.selectedInvoiceReference, {includeBillingDetails: true});
    if (context.invoiceStatus !== "paid") return true;
    const result = await recoveryController.recordPaid({...owned, context});
    return result?.outcome === "restarted";
  },
  observeFinalInvoice: r => processStripeSubscriptionEventUseCase.execute({mode: r.mode, event: {
    id: `backend_cancel_${r.mode}_${r.subscriptionReference}`, type: "customer.subscription.deleted",
    created: Math.floor(Date.now() / 1000), livemode: r.mode === "prod",
    data: {object: {object: "subscription", id: r.subscriptionReference, customer: r.customerReference}}
  }})});
async function getLiveStripeSubscriptionPaymentDetails(input) {
  return require("./application/load_stripe_subscription_payment_details").loadStripeSubscriptionPaymentDetails({
    input, cancellation, management: managePayment});
}
// Reconciliation reads Stripe, but never replays a payment or setup command.
const projectionManagement = new ManageStripeSubscriptionPayment({
  createPaymentProviderContext, getCustomerRecordByInternalReference, getSubscriptionRecord,
  getStudentSubscription, getInvoiceRecord, getGuardianStudentLink, getStudentById,
  observeRecoveredPayment: async () => null, ensureRenewalRecovery,
  getRenewalRecoveryDetails: async (input, loaded) => {
    const owned = await renewalPaymentRecovery.owned(input, loaded);
    return owned && renewalPaymentRecovery.details(owned, false, false);
  },
});
const paymentViews = new SubscriptionPaymentViews({repository: subscriptionPaymentViewRepository,
  onCaptureError: error => require("firebase-functions/logger").warn("Confirmed billing change awaits view reconciliation.", {code: error.code || "unavailable"}),
  getPaymentConfig, getCustomerRecordByInternalReference, getCustomerRecordByReference,
  getSubscriptionRecord, getGuardianStudentLink, getStudentSubscription, createPaymentProviderForContext,
  readLive: async (input, owned) => {
    const details = await projectionManagement.getDetails(input, owned);
    if (details.renewalRecovery?.version !== 2 && owned.selectedInvoiceReference) {
      // Repair a missed invoice webhook using verified provider data. This
      // writes the normal ledger/entitlement API and never pays an invoice.
      const context = await owned.paymentProvider.retrieveInvoicePaymentContext(owned.selectedInvoiceReference, {includeBillingDetails: true});
      if (context.subscriptionReference !== owned.subscriptionReference || context.customerReference !== owned.customer.customerReference) throw Error("Unexpected invoice projection owner.");
      const now = new Date();
      const record = require("./application/stripe_invoice_record").invoiceRecord({context,
        subscription: owned.subscription, registered: owned.record, customer: owned.customer, observedAt: now,
        selectedInvoiceReference: owned.selectedInvoiceReference});
      const fingerprint = require("node:crypto").createHash("sha256").update(JSON.stringify({...record, observedAt: undefined})).digest("hex");
      await recordInvoicePaymentEvent({studentId: owned.record.studentId, paymentProvider: "stripe", paymentMode: owned.mode,
        paymentSubscriptionReference: owned.subscriptionReference, eventReference: "backend_view_" + fingerprint,
        eventType: "backend.subscription_payment_view.verified", eventCreatedAt: now, invoiceRecord: record,
        renewalRetryPolicy: (await getPaymentConfig()).renewalRetryPolicy});
    }
    owned = {...owned, student: await getStudentSubscription(owned.record.studentId)};
    return cancellation.decorate(input, details, owned);
  }});
const storedPayments = new ReadStoredSubscriptionPayments({views: paymentViews, getPaymentConfig,
  getCustomerRecordByInternalReference, listSubscriptionRecords, listActiveGuardianStudentLinks,
  getStudentById, getStudentSubscription, getStudentSubscriptionCheckout, listSubscriptionPlanChoices, getInvoiceRecord});
async function getStripeSubscriptionPaymentDetails(input) {
  if (input.refreshFromStripe === true) await paymentViews.refresh(await paymentViews.scope(input));
  return storedPayments.getDetails(input);
}
async function getStripeGuardianSubscriptionOptions(input) {
  let options = await storedPayments.getOptions(input);
  if (input.refreshFromStripe === true) {
    let reference = options.subscriptionReference;
    if (!reference) {
      const context = await storedPayments.context(input);
      reference = context.records.filter(r => r.studentId === options.selectedStudentId)
        .sort((a, b) => +(b.createdAt?.toDate?.() || b.createdAt) - +(a.createdAt?.toDate?.() || a.createdAt))[0]?.subscriptionReference;
    }
    if (reference) await paymentViews.refresh(await paymentViews.scope({...input, subscriptionReference: reference}));
    options = await storedPayments.getOptions(input);
  }
  return options;
}
module.exports = {
  cancelStripeStudentSubscription: input => paymentViews.command(input, async () => {await cancellation.command(input); return getLiveStripeSubscriptionPaymentDetails(input);}),
  manageStripeRenewalRecovery: input => paymentViews.command(input, async () => {
    if (input.action === "cancel_subscription") {await cancellation.command(input); return getLiveStripeSubscriptionPaymentDetails(input);}
    await cancellation.requirePaymentAllowed(input);
    return renewalPaymentRecovery.command(input);
  }),
  getStripeGuardianSubscriptionOptions,
  prepareStripeStudentSubscription: input => guardianSubscriptions.prepare(input),
  createStripeStudentSubscription: async input => {
    const result = await guardianSubscriptions.create(input);
    const scope = await paymentViews.queue({...input, subscriptionReference: result.subscriptionReference}, "subscription_created");
    await paymentViews.refresh(scope);
    return result;
  },
  changeStripeStudentSubscriptionPlan: async input => {
    const options = await storedPayments.getOptions(input);
    const scope = await paymentViews.queue({...input, subscriptionReference: options.subscriptionReference}, "plan_change");
    await guardianSubscriptions.changePlan(input);
    await paymentViews.refresh(scope);
    return storedPayments.getOptions(input);
  },
  createStripePaymentSubscription,
  getStripeSubscriptionPaymentAction,
  processStripeSubscriptionEvent,
  retryStripeSubscriptionInvoicePayment: input => paymentViews.command(input, () => retryStripeSubscriptionInvoicePayment(input)),
  getStripeSubscriptionPaymentDetails,
  createStripeSubscriptionCardSetup: async input => {await cancellation.requirePaymentAllowed(input); return managePayment.createCardSetup(input);},
  updateStripeSubscriptionPaymentMethod: input => paymentViews.command(input, async () => {await cancellation.requirePaymentAllowed(input); return managePayment.updateCard(input);}),
  processDueStripeRenewalRetries: async input => {
    const deadline = Date.now() + 210000;
    const batch = () => ({...input, deadline: Math.min(deadline, Date.now() + 45000)});
    const cancellations = await cancellation.execute(batch());
    const current = await renewalPaymentRecovery.execute(batch());
    // Existing legacy jobs keep their original behavior; they are never enrolled
    // into v2 or bulk-voided. New episodes live in a separate collection.
    const recovery = await recoveryController.execute(batch());
    const retries = await dueRenewalRetries.execute(batch());
    const views = await paymentViews.execute(batch());
    return {...retries, current, recovery, cancellations, views, errors: current.errors + recovery.errors + retries.errors + cancellations.errors + views.errors};
  },
};
