import {
  getFirebaseApp
} from "../../../utils/firebase/firebase_ops.js";
import {
  StripePaymentGateway
} from "../domain/stripe_payment_gateway.js?v=20260904-stripe-setup-intent-v1";

const FIREBASE_FUNCTIONS_REGION = "us-central1";

export class FirebaseCallableStripePaymentGateway
  extends StripePaymentGateway {
  constructor({ getApp = getFirebaseApp } = {}) {
    super();
    this.getApp = getApp;
    this.functions = null;
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

  async call(functionName, data) {
    const callable = this.getFunctions().httpsCallable(functionName);
    const response = await callable(data);

    return response?.data;
  }

  async createCustomer(inputReference) {
    return this.call("createPaymentCustomer", {
      inputReference
    });
  }

  async deleteCustomer(customerReference) {
    return this.call("deleteCustomer", {
      customerReference
    });
  }

  async createSetupIntent(customerReference) {
    return this.call("createStripeSetupIntent", {
      customerReference
    });
  }
}
