const {makeStripeWebhookFixture} = require("./stripe_webhook_fixture");
const {ManageGuardianSubscriptions} = require("../application/manage_guardian_subscriptions");
const {CreateStripePaymentSubscription} = require("../application/create_stripe_payment_subscription");
const {FirestoreStudentCheckoutRepository} = require("../../syllabus_subscription/infrastructure/firestore_student_checkout_repository");
const {FirestoreStudentSubscriptionRepository} = require("../../syllabus_subscription/infrastructure/firestore_student_subscription_repository");
const {CreateStripePaymentCustomer} = require("../../stripe_payment_customer/application/create_stripe_payment_customer");
async function fixture({registered = false, mode = "prod"} = {}) {
  const f = await makeStripeWebhookFixture({registered, mode});
  const students = new FirestoreStudentSubscriptionRepository(f.memory.dependencies);
  const checkouts = new FirestoreStudentCheckoutRepository({...f.memory.dependencies, now: () => f.now});
  const context = async () => ({providerName: "stripe", mode, paymentProvider: f.stripe});
  const records = async () => {
    const prefix = `stripeCustomers/${mode}/customers/cus_one/subscriptions/`;
    return [...f.memory.store].filter(([path]) => path.startsWith(prefix)).map(([path, data]) =>
      ({...data, mode, customerReference: "cus_one", subscriptionReference: path.slice(prefix.length)}));
  };
  f.links = ["student-a", "student-b"];
  f.memory.put("subscriptions/student-b", {subscriptionType: "trial", createdAt: f.now, updatedAt: f.now});
  const common = new CreateStripePaymentSubscription({createPaymentProviderContext: context,
    getCustomerRecordByReference: input => f.records.getCustomerRecordByReference(input),
    getGuardianStudentLink: async ({studentId, guardianId}) => ({isActive: guardianId === "guardian-a" && f.links.includes(studentId)}),
    getStudentSubscription: id => students.getSubscription(id),
    getSubscriptionPlanBillingTerms: async () => f.billingTerms,
    initializeSubscriptionRecord: input => f.records.initializeSubscriptionRecord(input),
    initializeInvoiceRecord: input => f.billing.initializeInvoiceRecord(input),
    listSubscriptionRecords: records, getStudentSubscriptionCheckout: input => checkouts.get(input),
    claimStudentSubscriptionCheckout: input => checkouts.claim(input), completeStudentSubscriptionCheckout: input => checkouts.complete(input),
    now: () => f.now});
  f.stripe.stripeClient.customers.retrieve = async () => ({id: "cus_one"});
  const customers = new CreateStripePaymentCustomer({createPaymentProviderContext: context,
    getCustomerRecordByInternalReference: input => f.records.getCustomerRecordByInternalReference(input),
    createCustomerRecord() {throw Error("Existing customer must be reused");}, replaceCustomerRecord() {throw Error("Unexpected customer replacement");}});
  f.setupCalls = [];
  f.stripe.stripeClient.setupIntents = {
    async create(input) {
      f.setupCalls.push(input);
      f.setup = {id: "seti_new", client_secret: "seti_new_secret_local", customer: "cus_one", status: "requires_confirmation",
        usage: "off_session", payment_method: "pm_one", metadata: input.metadata, created: +f.now / 1000};
      return structuredClone(f.setup);
    },
    retrieve: async () => structuredClone(f.setup),
  };
  const dependencies = {createPaymentProviderContext: context,
    getGuardianStudentLink: async ({guardianId, studentId}) => ({isActive: guardianId === "guardian-a" && f.links.includes(studentId)}),
    listActiveGuardianStudentLinks: async () => f.links.map(studentId => ({studentId})),
    getStudentById: async studentId => ({id: studentId, name: studentId === "student-a" ? "Alice" : "Ben", country: "Malaysia", pin: "private"}),
    getStudentSubscription: id => students.getSubscription(id),
    createStudentSubscription: async ({studentId}) => f.memory.put(`subscriptions/${studentId}`, {subscriptionType: "trial"}),
    getStudentSubscriptionCheckout: input => checkouts.get(input),
    getCustomerRecordByInternalReference: input => f.records.getCustomerRecordByInternalReference(input),
    listSubscriptionRecords: records,
    listSubscriptionPlanChoices: async () => [{planId: "monthly", name: "Monthly", months: 1, ...f.billingTerms}],
    getSubscriptionPlanBillingTerms: async () => f.billingTerms,
    createStripePaymentCustomer: input => customers.execute(input),
    createStripePaymentSubscription: input => common.execute(input), now: () => f.now};
  const manager = new ManageGuardianSubscriptions(dependencies);
  const base = {internalReference: "guardian-a", studentId: "student-a"};
  const input = async () => ({...base, planId: "monthly", idempotencyReference: "checkout-one",
    quoteReference: (await manager.options(base)).plans[0].quoteReference, email: "guardian@example.test"});
  return Object.assign(f, {manager, dependencies, checkouts, common, input, base});
}

module.exports = {fixture};
