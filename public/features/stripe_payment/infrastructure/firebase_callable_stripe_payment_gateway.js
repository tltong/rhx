import {
  getFirebaseApp
} from "../../../utils/firebase/firebase_ops.js";
import {
  StripePaymentGateway
} from "../domain/stripe_payment_gateway.js?v=20261028-saved-card-retry-v1";
import {FirebaseCallableStripeSubscriptionPaymentGateway}
  from "../../stripe_payment_subscription/infrastructure/firebase_callable_stripe_subscription_payment_gateway.js?v=20261028-subscription-feature-v1";

const FIREBASE_FUNCTIONS_REGION = "us-central1";

export class FirebaseCallableStripePaymentGateway
  extends StripePaymentGateway {
  constructor({ getApp = getFirebaseApp } = {}) {
    super();
    this.getApp = getApp;
    this.functions = null;
    this.subscriptionGateway = new FirebaseCallableStripeSubscriptionPaymentGateway({getApp});
  }

  getFunctions() {
    if (this.functions) {
      return this.functions;
    }

    const app = this.getApp();

    if (!app || typeof app.functions !== "function") {
      throw new Error(
        "Firebase Functions SDK is not available. Include firebase-functions-compat.js."
      );
    }

    this.functions = app.functions(FIREBASE_FUNCTIONS_REGION);
    return this.functions;
  }

  async call(functionName, data, options) {
    const callable = this.getFunctions().httpsCallable(functionName, options);
    const response = await callable(data);

    return response?.data;
  }

  async createCustomer(inputReference, email) {
    return this.call("createPaymentCustomer", {
      inputReference,
      email
    });
  }

  async listCustomers() {
    return this.call("listStripeCustomers", {});
  }

  async deleteCustomer(customerReference) {
    return this.call("deleteCustomer", {
      customerReference
    });
  }

  async createSetupIntent(customerReference) {
    return typeof customerReference === "string"
      ? this.call("createStripeSetupIntent", {customerReference})
      : this.subscriptionGateway.createSubscriptionCardSetup(customerReference);
  }

  async createSubscription(input) {
    return this.call("createStripeSubscription", input);
  }

  async getSubscriptionPaymentAction(subscriptionReference) {
    return this.subscriptionGateway.getSubscriptionPaymentAction(subscriptionReference);
  }

  async retrySubscriptionPayment(input) {
    return this.subscriptionGateway.retrySubscriptionPayment(input);
  }

  async getClientConfig() {
    return this.call("getStripeClientConfig", {});
  }

  async getSubscriptionPaymentDetails(input) {
    return this.subscriptionGateway.getSubscriptionPaymentDetails(input);
  }

  async updateSubscriptionPaymentMethod(input) {
    return this.subscriptionGateway.updateSubscriptionPaymentMethod(input);
  }
}
