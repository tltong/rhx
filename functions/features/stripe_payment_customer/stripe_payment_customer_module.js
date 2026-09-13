/**
 * Internal application API:
 *
 * createStripePaymentCustomer({internalReference: string, email: string})
 *   -> Promise<string> Stripe customer reference
 * createStripePaymentSetupIntent({customerReference: string})
 *   -> Promise<string> Stripe SetupIntent client secret
 * deleteStripePaymentCustomer({customerReference: string})
 *   -> Promise<string> deleted Stripe customer reference
 * processStripeSetupIntentEvent({mode: "test"|"prod", event: Stripe.Event})
 *   -> Promise<{handled, eventType, mode?, customerReference?,
 *      setupIntentReference?, status?, paymentMethodReference?}>
 *
 * This feature orchestrates Stripe customer creation and local persistence.
 * It does not expose a Cloud Function or access Firestore directly.
 */
const {
  createPaymentProviderContext,
} = require("../payment_factory/payment_factory_module");
const {
  createStripePayment,
} = require("../stripe_payment/stripe_payment_module");
const {
  createCustomerRecord,
  deleteCustomerRecord,
  getCustomerRecordByReference,
  getCustomerRecordByInternalReference,
  replaceCustomerRecord,
  writeSetupIntentRecord,
  writePaymentMethodRecord,
} = require("../stripe_customer/stripe_customer_module");
const {
  CreateStripePaymentCustomer,
} = require("./application/create_stripe_payment_customer");
const {
  DeleteStripePaymentCustomer,
} = require("./application/delete_stripe_payment_customer");
const {
  CreateStripePaymentSetupIntent,
} = require("./application/create_stripe_payment_setup_intent");
const {
  ProcessStripeSetupIntentEvent,
} = require("./application/process_stripe_setup_intent_event");

const createStripePaymentCustomerUseCase =
  new CreateStripePaymentCustomer({
    createPaymentProviderContext,
    getCustomerRecordByInternalReference,
    createCustomerRecord,
    replaceCustomerRecord,
  });
const createStripePaymentSetupIntentUseCase =
  new CreateStripePaymentSetupIntent({
    createPaymentProviderContext,
    getCustomerRecordByReference,
    writeSetupIntentRecord,
  });
const deleteStripePaymentCustomerUseCase =
  new DeleteStripePaymentCustomer({
    createPaymentProviderContext,
    deleteCustomerRecord,
  });
const processStripeSetupIntentEventUseCase =
  new ProcessStripeSetupIntentEvent({
    createStripePayment,
    getCustomerRecordByReference,
    writeSetupIntentRecord,
    writePaymentMethodRecord,
  });

async function createStripePaymentCustomer(input) {
  return createStripePaymentCustomerUseCase.execute(input);
}

async function createStripePaymentSetupIntent(input) {
  return createStripePaymentSetupIntentUseCase.execute(input);
}

async function deleteStripePaymentCustomer(input) {
  return deleteStripePaymentCustomerUseCase.execute(input);
}

async function processStripeSetupIntentEvent(input) {
  return processStripeSetupIntentEventUseCase.execute(input);
}

module.exports = {
  createStripePaymentCustomer,
  createStripePaymentSetupIntent,
  deleteStripePaymentCustomer,
  processStripeSetupIntentEvent,
};
