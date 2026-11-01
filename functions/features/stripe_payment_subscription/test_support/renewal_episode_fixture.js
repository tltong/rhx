const {makeTransactionalFirestore} = require("../../stripe_customer/test_support/transactional_firestore");
const {FirestoreRenewalEpisodeRepository} = require("../../syllabus_subscription/infrastructure/firestore_renewal_episode_repository");
const {RenewalPaymentRecovery} = require("../application/renewal_payment_recovery");
const {quote} = require("../application/manage_guardian_subscriptions");
function fixture() {
  const memory = makeTransactionalFirestore();
  const f = {memory, now: new Date("2026-11-01T00:00:00Z"), mode: "test", operations: [], payments: new Map(), invoices: new Map(),
    outcomes: [], payCount: 0, policy: {maxRetries: 3, intervalHours: 12, gracePeriodHours: 72}, appliedPlans: []};
  f.record = {mode: "test", customerReference: "cus_one", subscriptionReference: "sub_one", studentId: "student",
    planId: "monthly", amount: 2500, currency: "myr", interval: "month", intervalCount: 1, createdAt: new Date("2026-10-01")};
  f.subscription = {subscriptionReference: "sub_one", customerReference: "cus_one", status: "past_due", collectionMethod: "charge_automatically",
    currentPeriodStart: f.now, currentPeriodEnd: new Date("2026-12-01"), subscriptionStartDate: f.record.createdAt,
    latestInvoiceReference: "in_original", defaultPaymentMethodReference: "pm_saved", currentPriceReference: "price_monthly", cancelAtPeriodEnd: false};
  f.context = {invoiceReference: "in_original", customerReference: "cus_one", subscriptionReference: "sub_one", billingReason: "subscription_cycle",
    invoiceStatus: "open", invoiceCreatedAt: f.now, paymentStatus: "requires_payment_method", failureCode: "insufficient_funds",
    currency: "myr", amountRemaining: 2500, failedPaymentMethodReference: "pm_saved"};
  memory.put("subscriptions/student", {subscriptionType: "ongoing", paymentProvider: "stripe", paymentMode: "test",
    paymentSubscriptionReference: "sub_one", activeUntil: f.now, applicationStatus: "active"});
  f.repo = new FirestoreRenewalEpisodeRepository({...memory.dependencies, now: () => f.now});
  const clone = value => structuredClone(value);
  f.provider = {
    retrieveSubscription: async () => clone(f.subscription),
    retrieveInvoicePaymentContext: async ref => clone(ref === "in_original" ? f.context : {invoiceReference: ref, customerReference: "cus_one", subscriptionReference: "sub_one", billingReason: "manual", invoiceCreatedAt: f.now}),
    retrievePaymentMethod: async ref => ({paymentMethodReference: ref, customerReference: "cus_one", type: "card", card: {brand: "visa", last4: "4242", expiryMonth: 12, expiryYear: 2035}}),
    disableInvoiceAutomaticCollection: async () => {f.collectionDisabled = true;},
    resolveSubscriptionPrice: async terms => terms.amount === 24000 ? "price_annual" : "price_monthly",
    async renewalEpisodeOperation(operation, e) {
      f.operations.push({operation, id: e.attempt?.id, target: e.targetInvoiceReference});
      if (f.failOperation === operation) throw Error("Temporary service error");
      const a = e.attempt, pi = a?.paymentIntentReference && f.payments.get(a.paymentIntentReference);
      switch (operation) {
      case "ensurePaused": f.subscription.status = "paused"; f.subscription.paused = true; return;
      case "dropInvoice": {
        if (e.targetInvoiceReference === "in_original") {f.context.invoiceStatus = "void"; return {dropped: true};}
        const i = f.invoices.get(e.targetInvoiceReference); i.status = "void"; return {dropped: true};
      }
      case "createDraft": {
        const id = "in_" + a.id.slice(0, 12); if (!f.invoices.has(id)) f.invoices.set(id, {status: "draft"});
        return {invoiceReference: id, invoiceItemReference: "ii_" + a.id.slice(0, 12)};
      }
      case "createPayment": {
        const id = "pi_" + a.id.slice(0, 12);
        if (!f.payments.has(id)) f.payments.set(id, {status: a.paymentMethodReference ? "requires_confirmation" : "requires_payment_method", clientSecret: id + "_secret_private", failureCode: null});
        return {paymentIntentReference: id};
      }
      case "confirm": {
        f.payCount++;
        const status = f.outcomes.shift() || "succeeded";
        Object.assign(pi, {status, failureCode: status === "requires_payment_method" ? f.declineCode || "insufficient_funds" : null,
          paymentMethodReference: a.paymentMethodReference, paidAt: status === "succeeded" ? f.now : null});
        if (f.loseConfirmResponse) {f.loseConfirmResponse = false; throw Error("Lost response after payment");}
        return clone(pi);
      }
      case "payment": return clone(pi);
      case "cancelPayment":
        if (pi.status === "succeeded") return {paid: true};
        if (pi.status === "processing") return {pending: true};
        pi.status = "canceled"; return {cancelled: true};
      case "settleInvoice": Object.assign(f.invoices.get(a.invoiceReference), {status: "paid", start: a.paidAt, end: a.paidThrough}); return;
      case "resumePrepaid": Object.assign(f.subscription, {status: "trialing", paused: false, currentPeriodEnd: a.paidThrough,
        currentPriceReference: a.priceReference, currentPeriodStart: a.paidAt, recoveryState: "completed"}); return;
      default: throw Error("Unexpected operation " + operation);
      }
    },
  };
  f.annual = {stripeProductName: "Annual", amount: 24000, currency: "myr", interval: "month", intervalCount: 12};
  f.dependencies = {repository: f.repo, now: () => f.now,
    createPaymentProviderContext: async () => ({providerName: "stripe", mode: f.mode, paymentProvider: f.provider}),
    createPaymentProviderForContext: async ({mode}) => {f.usedMode = mode; return {paymentProvider: f.provider};},
    getSubscriptionRecord: async ({mode, customerReference, subscriptionReference}) => mode === "test" && customerReference === "cus_one" && subscriptionReference === "sub_one" ? clone(f.record) : null,
    getCustomerRecordByInternalReference: async ({internalReference}) => internalReference === "guardian" ? {customerReference: "cus_one", internalReference} : null,
    getCustomerRecordByReference: async () => ({customerReference: "cus_one", internalReference: "guardian"}),
    getStudentSubscription: async () => clone(memory.store.get("subscriptions/student")),
    getGuardianStudentLink: async () => f.unlinked ? null : {state: "active"}, getStudentById: async () => ({name: "Alice", country: "Malaysia"}),
    getPaymentConfig: async () => ({renewalRetryPolicy: f.policy}), getInvoiceRecord: async () => f.legacyInvoice || null,
    getSubscriptionPlanBillingTerms: async () => clone(f.annual),
    applyRecoveredPlan: async input => {f.appliedPlans.push(clone(input)); Object.assign(f.record, {planId: input.planId, ...input.terms});},
  };
  f.controller = new RenewalPaymentRecovery(f.dependencies);
  f.event = (type = "invoice.payment_failed", patch = {}) => ({mode: "test", event: {id: "evt_test", type, created: +f.now / 1000,
    livemode: false, data: {object: {object: "invoice", id: "in_original", customer: "cus_one", subscription: "sub_one", ...patch}}}});
  f.initialize = () => f.controller.handleStripeEvent(f.event());
  f.student = () => clone(memory.store.get("subscriptions/student"));
  f.episode = () => f.repo.get({studentId: "student", id: f.student().renewalRecovery.episodeReference});
  f.input = (patch = {}) => ({internalReference: "guardian", subscriptionReference: "sub_one", invoiceReference: "in_original", idempotencyReference: "request-one", ...patch});
  f.command = (patch = {}) => f.controller.command(f.input({action: "retry", ...patch}));
  f.details = () => f.controller.getDetails(f.input());
  f.moveHours = hours => {f.now = new Date(+f.now + hours * 3600000);};
  f.planInput = () => ({planId: "annual", quoteReference: quote("Malaysia", "annual", f.annual, "test")});
  return f;
}
module.exports = {fixture};
