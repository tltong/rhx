import {getFirebaseApp} from "../../../utils/firebase/firebase_ops.js";
import {StripeSubscriptionPaymentGateway}
  from "../domain/stripe_subscription_payment_gateway.js?v=20261101-stored-status-v1";

// Only authenticated application callables are used here. Stripe resource
// ownership, current invoice state and retry eligibility are resolved server-side.
export class FirebaseCallableStripeSubscriptionPaymentGateway
  extends StripeSubscriptionPaymentGateway {
  constructor({getApp = getFirebaseApp} = {}) {
    super();
    this.getApp = getApp;
    this.functions = null;
  }

  async call(name, input, options) {
    if (!this.functions) {
      const app = this.getApp();
      if (!app || typeof app.functions !== "function") {
        throw new Error("Firebase Functions SDK is not available. Include firebase-functions-compat.js.");
      }
      this.functions = app.functions("us-central1");
    }
    const result = await this.functions.httpsCallable(name, options)(input);
    return result?.data;
  }

  getSubscriptionPaymentDetails(input) {
    return this.call("getStripeSubscriptionPaymentDetails", input, {timeout: 150000});
  }
  manageRenewalRecovery(input) {return this.call("manageStripeRenewalRecovery", input, {timeout: 180000});}
  getGuardianSubscriptionOptions(input) {return this.call("getStripeGuardianSubscriptionOptions", input, {timeout: 120000});}
  prepareStudentSubscription(input) {return this.call("prepareStripeStudentSubscription", input, {timeout: 120000});}
  createStudentSubscription(input) {return this.call("createStripeStudentSubscription", input, {timeout: 120000});}
  changeStudentSubscriptionPlan(input) {return this.call("changeStripeStudentSubscriptionPlan", input, {timeout: 120000});}
  getSubscriptionPaymentAction(input) {
    return this.call("getStripeSubscriptionPaymentAction",
      typeof input === "string" ? {subscriptionReference: input} : input);
  }
  retrySubscriptionPayment(input) {
    return this.call("retryStripeSubscriptionPayment", input, {timeout: 120000});
  }
  createSubscriptionCardSetup(input) {
    // The existing callable dispatches subscription-bound setup to the
    // stripe_payment_subscription backend feature.
    return this.call("createStripeSetupIntent", input);
  }
  updateSubscriptionPaymentMethod(input) {
    return this.call("updateStripeSubscriptionPaymentMethod", input,
      input.cardChangeScope === "all_students" ? {timeout: 120000} : undefined);
  }
}
