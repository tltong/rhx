/**
 * Internal persistence API contracts
 *
 * createCustomerRecord({mode, customerReference, internalReference, email})
 *   -> Promise<StripeCustomerRecord>
 * getCustomerRecordByReference({mode, customerReference})
 *   -> Promise<StripeCustomerRecord|null>
 * getCustomerRecordByInternalReference({mode, internalReference})
 *   -> Promise<StripeCustomerRecord|null>
 * updateCustomerRecord({mode, customerReference,
 *   changes: {internalReference?, email?}})
 *   -> Promise<StripeCustomerRecord>
 * replaceCustomerRecord({mode, staleCustomerReference, customerReference,
 *   internalReference, email}) -> Promise<StripeCustomerRecord>
 * deleteCustomerRecord({mode, customerReference}) -> Promise<void>
 *
 * writeSetupIntentRecord(input) -> Promise<StripeSetupIntentRecord>
 * getSetupIntentRecord(input) -> Promise<StripeSetupIntentRecord|null>
 * listSetupIntentRecords({mode, customerReference})
 *   -> Promise<StripeSetupIntentRecord[]>
 * deleteSetupIntentRecord(input) -> Promise<void>
 *
 * writePaymentMethodRecord(input) -> Promise<StripePaymentMethodRecord>
 * getPaymentMethodRecord(input) -> Promise<StripePaymentMethodRecord|null>
 * listPaymentMethodRecords({mode, customerReference})
 *   -> Promise<StripePaymentMethodRecord[]>
 * deletePaymentMethodRecord(input) -> Promise<void>
 *
 * writeSubscriptionRecord({mode, customerReference, subscriptionReference,
 *   studentId?, planId?, paymentMethodReference, status, amount, currency,
 *   interval, intervalCount,
 *   subscriptionStartDate, currentPeriodStart, currentPeriodEnd,
 *   cancelAtPeriodEnd}) -> Promise<StripeSubscriptionRecord>
 * getSubscriptionRecord(input) -> Promise<StripeSubscriptionRecord|null>
 * listSubscriptionRecords({mode, customerReference})
 *   -> Promise<StripeSubscriptionRecord[]>
 * deleteSubscriptionRecord(input) -> Promise<void>
 *
 * These APIs only maintain the stripeCustomers schema. They do not call
 * Stripe, load payment configuration, or apply application subscription logic.
 */
const {
  stripeCustomerModes,
} = require("../../schema/stripe_customer_schema");
const {
  ManageStripeCustomerRecords,
} = require("./application/manage_stripe_customer_records");
const {
  FirestoreStripeCustomerRepository,
} = require(
  "./infrastructure/firestore_stripe_customer_repository"
);

const stripeCustomerRepository = new FirestoreStripeCustomerRepository();
const stripeCustomerRecords = new ManageStripeCustomerRecords({
  stripeCustomerRepository,
});

async function createCustomerRecord(input) {
  return stripeCustomerRecords.createCustomerRecord(input);
}

async function getCustomerRecordByReference(input) {
  return stripeCustomerRecords.getCustomerRecordByReference(input);
}

async function getCustomerRecordByInternalReference(input) {
  return stripeCustomerRecords.getCustomerRecordByInternalReference(input);
}

async function updateCustomerRecord(input) {
  return stripeCustomerRecords.updateCustomerRecord(input);
}

async function replaceCustomerRecord(input) {
  return stripeCustomerRecords.replaceCustomerRecord(input);
}

async function deleteCustomerRecord(input) {
  return stripeCustomerRecords.deleteCustomerRecord(input);
}

async function writeSetupIntentRecord(input) {
  return stripeCustomerRecords.writeSetupIntentRecord(input);
}

async function getSetupIntentRecord(input) {
  return stripeCustomerRecords.getSetupIntentRecord(input);
}

async function listSetupIntentRecords(input) {
  return stripeCustomerRecords.listSetupIntentRecords(input);
}

async function deleteSetupIntentRecord(input) {
  return stripeCustomerRecords.deleteSetupIntentRecord(input);
}

async function writePaymentMethodRecord(input) {
  return stripeCustomerRecords.writePaymentMethodRecord(input);
}

async function getPaymentMethodRecord(input) {
  return stripeCustomerRecords.getPaymentMethodRecord(input);
}

async function listPaymentMethodRecords(input) {
  return stripeCustomerRecords.listPaymentMethodRecords(input);
}

async function deletePaymentMethodRecord(input) {
  return stripeCustomerRecords.deletePaymentMethodRecord(input);
}

async function writeSubscriptionRecord(input) {
  return stripeCustomerRecords.writeSubscriptionRecord(input);
}

async function getSubscriptionRecord(input) {
  return stripeCustomerRecords.getSubscriptionRecord(input);
}

async function listSubscriptionRecords(input) {
  return stripeCustomerRecords.listSubscriptionRecords(input);
}

async function deleteSubscriptionRecord(input) {
  return stripeCustomerRecords.deleteSubscriptionRecord(input);
}

module.exports = {
  stripeCustomerModes,
  createCustomerRecord,
  getCustomerRecordByReference,
  getCustomerRecordByInternalReference,
  updateCustomerRecord,
  replaceCustomerRecord,
  deleteCustomerRecord,
  writeSetupIntentRecord,
  getSetupIntentRecord,
  listSetupIntentRecords,
  deleteSetupIntentRecord,
  writePaymentMethodRecord,
  getPaymentMethodRecord,
  listPaymentMethodRecords,
  deletePaymentMethodRecord,
  writeSubscriptionRecord,
  getSubscriptionRecord,
  listSubscriptionRecords,
  deleteSubscriptionRecord,
};
