const Stripe = require("stripe");
const {makeBillingFixture, NOW, END} = require("../../syllabus_subscription/test_support/billing_fixture");
const {ManageStripeCustomerRecords} = require("../../stripe_customer/application/manage_stripe_customer_records");
const {FirestoreStripeCustomerRepository} = require("../../stripe_customer/infrastructure/firestore_stripe_customer_repository");
const {StripePayment} = require("../../stripe_payment/domain/stripe_payment");
const {ProcessStripeSubscriptionEvent} = require("../application/process_stripe_subscription_event");
const {CreateStripePaymentSubscription} = require("../application/create_stripe_payment_subscription");
const {FirestoreStudentSubscriptionRepository} = require("../../syllabus_subscription/infrastructure/firestore_student_subscription_repository");
const unix = date => Math.floor(date.getTime() / 1000);
async function makeStripeWebhookFixture({mode = "prod", registered = true} = {}) {
  const f = makeBillingFixture(); f.scope.paymentMode = mode;
  const records = new ManageStripeCustomerRecords({stripeCustomerRepository:
    new FirestoreStripeCustomerRepository(f.memory.dependencies), now: () => f.now});
  await records.createCustomerRecord({mode, customerReference: "cus_one", internalReference: "guardian-a", email: "guardian@example.test"});
  const metadata = {mode, studentId: "student-a", planId: "monthly", customerReference: "cus_one", subscriptionReference: "sub_one",
    paymentMethodReference: "pm_one", status: "incomplete", amount: 2500, currency: "myr", interval: "month", intervalCount: 1};
  if (registered) await records.initializeSubscriptionRecord(metadata);
  const state = {
    subscription: {id: "sub_one", object: "subscription", customer: "cus_one", status: "incomplete", start_date: unix(NOW),
      current_period_start: unix(NOW), current_period_end: unix(END), cancel_at_period_end: false,
      latest_invoice: "in_initial", default_payment_method: "pm_one", collection_method: "charge_automatically",
      payment_settings: {save_default_payment_method: "on_subscription"}},
    invoice: {id: "in_initial", object: "invoice", customer: "cus_one", subscription: "sub_one", billing_reason: "subscription_create",
      created: unix(NOW), status: "open", amount_due: 2500, amount_paid: 0, amount_remaining: 2500,
      currency: "myr", collection_method: "charge_automatically", attempted: false, attempt_count: 0,
      next_payment_attempt: null, status_transitions: {paid_at: null}, confirmation_secret: {client_secret: "pi_one_secret_private"},
      lines: {data: [{id: "il_one", parent: {type: "subscription_item_details", subscription_item_details: {
        subscription: "sub_one", subscription_item: "si_one", proration: false}}, period: {start: unix(NOW), end: unix(END)}}], has_more: false}},
    intent: {id: "pi_one", customer: "cus_one", status: "requires_confirmation", client_secret: "pi_one_secret_private", payment_method: "pm_one"},
    method: {id: "pm_one", customer: "cus_one", type: "card", card: {brand: "visa", last4: "4242", exp_month: 12, exp_year: 2030}},
    requests: [], createRequests: [],
  };
  const createResponses = new Map();
  const stripe = new StripePayment({customers: {create() {throw Error("Unexpected customer creation");}, del() {}},
    prices: {list: async () => ({data: [{id: "price_monthly"}]}), create() {throw Error("Unexpected price creation");}},
    subscriptions: {
      async create(input, options) {
        state.createRequests.push({input, options});
        if (!createResponses.has(options.idempotencyKey)) createResponses.set(options.idempotencyKey,
          {...structuredClone(state.subscription), latest_invoice: structuredClone(state.invoice)});
        return structuredClone(createResponses.get(options.idempotencyKey));
      },
      async retrieve(id, options) {
        state.requests.push(["subscription", id]);
        if (state.retrievalError) throw state.retrievalError;
        return {...structuredClone(state.subscription), ...(options?.expand
          ? {latest_invoice: structuredClone(state.invoice)} : {})};
      },
    },
    invoices: {async retrieve(id) {state.requests.push(["invoice", id]); return structuredClone(state.invoice);}},
    paymentIntents: {retrieve: async () => structuredClone(state.intent)},
    paymentMethods: {retrieve: async () => structuredClone(state.method)},
  });
  const processor = new ProcessStripeSubscriptionEvent({createStripePayment: () => stripe,
    getSubscriptionRecord: input => records.getSubscriptionRecord(input),
    getCustomerRecordByReference: input => records.getCustomerRecordByReference(input),
    recordInvoicePaymentEvent: input => f.billing.recordInvoicePaymentEvent(input),
    writePaymentMethodRecord: input => records.writePaymentMethodRecord(input), now: () => f.now});
  const studentRepo = new FirestoreStudentSubscriptionRepository(f.memory.dependencies);
  f.billingTerms = {stripeProductName: "Monthly", amount: 2500, currency: "myr", interval: "month", intervalCount: 1};
  const create = new CreateStripePaymentSubscription({createPaymentProviderContext: async () => ({providerName: "stripe", mode, paymentProvider: stripe}),
    getCustomerRecordByReference: input => records.getCustomerRecordByReference(input),
    getGuardianStudentLink: async () => ({isActive: true}), getStudentSubscription: id => studentRepo.getSubscription(id),
    getSubscriptionPlanBillingTerms: async () => f.billingTerms,
    initializeSubscriptionRecord: input => records.initializeSubscriptionRecord(input),
    initializeInvoiceRecord: input => f.billing.initializeInvoiceRecord(input), now: () => f.now});
  let sequence = 0;
  const event = (type, id = `evt_${++sequence}`) => ({id, type, created: unix(f.now), livemode: mode === "prod",
    data: {object: structuredClone(type.startsWith("customer.subscription.") ? state.subscription : state.invoice)}});
  const pay = () => {state.subscription.status = "active"; state.invoice.status = "paid"; state.invoice.amount_paid = state.invoice.amount_due;
    state.invoice.amount_remaining = 0; state.invoice.attempted = true; state.invoice.attempt_count++;
    state.invoice.status_transitions.paid_at = unix(f.now); state.intent.status = "succeeded";};
  const fail = () => {state.subscription.status = state.invoice.billing_reason === "subscription_create" ? "incomplete" : "past_due";
    state.invoice.status = "open"; state.invoice.attempted = true; state.invoice.attempt_count++;
    state.intent.status = "requires_payment_method"; state.intent.last_payment_error = {code: "card_declined", decline_code: "insufficient_funds"};};
  const signatureClient = new Stripe("sk_test_local_fixture");
  const factory = mode === "prod" ? require("../../../stripe_prod_webhook").createStripeProdWebhookHandlers
    : require("../../../stripe_test_webhook").createStripeTestWebhookHandlers;
  const handlers = factory({constructWebhookEvent: input => signatureClient.webhooks.constructEvent(input.payload, input.signature, input.webhookSecret),
    processSubscriptionEvent: input => processor.execute(input), processSetupIntentEvent: async () => ({handled: false}),
    readWebhookSecret: () => "whsec_local_fixture", eventLogger: {info() {}, warn() {}, error() {}}});
  const root = mode === "prod" ? handlers.stripeProdWebhookHandler : handlers.stripeTestWebhookHandler;
  async function deliver(value, badSignature = false) {
    const body = JSON.stringify(value), response = {statusCode: null, body: null, set() {},
      status(status) {this.statusCode = status; return this;}, json(data) {this.body = data; return this;}};
    const signature = signatureClient.webhooks.generateTestHeaderString({payload: body, secret: badSignature ? "wrong" : "whsec_local_fixture"});
    await root({method: "POST", rawBody: Buffer.from(body), headers: {"stripe-signature": signature}}, response);
    return response;
  }
  return Object.assign(f, {mode, records, state, stripe, processor, event, pay, fail, deliver,
    process: value => processor.execute({mode, event: value}),
    checkout: (changes = {}) => create.execute({internalReference: "guardian-a", studentId: "student-a", customerReference: "cus_one",
      paymentMethodReference: "pm_one", country: "Malaysia", planId: "monthly", idempotencyReference: "same-checkout", ...changes})});
}
module.exports = {makeStripeWebhookFixture, unix, NOW, END};
