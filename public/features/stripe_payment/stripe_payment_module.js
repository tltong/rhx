/**
 * Public APIs:
 *
 * createPaymentCustomer(inputReference)
 *   -> Promise<string> Stripe customer reference
 * deleteCustomer(customerReference)
 *   -> Promise<string> deleted Stripe customer reference
 * createStripeSetupIntent(customerReference)
 *   -> Promise<string> Stripe SetupIntent client secret
 */
import {
  CreatePaymentCustomer
} from "./application/create_payment_customer.js?v=20260903-stripe-customer-test-v1";
import {
  DeletePaymentCustomer
} from "./application/delete_payment_customer.js?v=20260903-stripe-customer-test-v1";
import {
  CreateStripeSetupIntent
} from "./application/create_setup_intent.js?v=20260904-stripe-setup-intent-v1";
import {
  FirebaseCallableStripePaymentGateway
} from "./infrastructure/firebase_callable_stripe_payment_gateway.js?v=20260904-stripe-setup-intent-v1";

const stripePaymentGateway = new FirebaseCallableStripePaymentGateway();
const createPaymentCustomerUseCase = new CreatePaymentCustomer(
  stripePaymentGateway
);
const deletePaymentCustomerUseCase = new DeletePaymentCustomer(
  stripePaymentGateway
);
const createStripeSetupIntentUseCase = new CreateStripeSetupIntent(
  stripePaymentGateway
);

async function createPaymentCustomer(inputReference) {
  return createPaymentCustomerUseCase.execute(inputReference);
}

async function deleteCustomer(customerReference) {
  return deletePaymentCustomerUseCase.execute(customerReference);
}

async function createStripeSetupIntent(customerReference) {
  return createStripeSetupIntentUseCase.execute(customerReference);
}

export {
  createStripeSetupIntent,
  createPaymentCustomer,
  deleteCustomer
};
