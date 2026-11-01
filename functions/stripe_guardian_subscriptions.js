const {onCall, HttpsError} = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const {paymentProviderSecrets} = require("./features/payment_factory/payment_factory_module");
const subscription = require("./features/stripe_payment_subscription/stripe_payment_subscription_module");
const OPTIONS = {region: "us-central1", secrets: paymentProviderSecrets, timeoutSeconds: 120};
function identifier(value, field, optional = false) {
  if (optional && value == null) return undefined;
  if (typeof value !== "string" || !value.trim() || value.includes("/") || value.length > 500) {
    throw new HttpsError("invalid-argument", `${field} is invalid.`);
  }
  return value.trim();
}
function createGuardianSubscriptionHandlers(dependencies = subscription) {
  const handler = (action, command = false) => async request => {
    const internalReference = request?.auth?.uid;
    if (!internalReference) throw new HttpsError("unauthenticated", "Sign in with your guardian account.");
    const input = {internalReference, studentId: identifier(request.data?.studentId, "studentId", !command)};
    if (command) {
      input.planId = identifier(request.data?.planId, "planId");
      input.quoteReference = identifier(request.data?.quoteReference, "quoteReference");
      input.idempotencyReference = identifier(request.data?.idempotencyReference, "idempotencyReference");
      input.setupIntentReference = identifier(request.data?.setupIntentReference, "setupIntentReference", true);
      input.savedCardReference = identifier(request.data?.savedCardReference, "savedCardReference", true);
      input.email = request.auth.token?.email;
    } else {
      input.subscriptionReference = identifier(request.data?.subscriptionReference, "subscriptionReference", true);
      if (request.data?.refreshFromStripe !== undefined) {
        if (typeof request.data.refreshFromStripe !== "boolean") throw new HttpsError("invalid-argument", "refreshFromStripe must be a boolean.");
        input.refreshFromStripe = request.data.refreshFromStripe;
      }
    }
    try {return await dependencies[action](input);}
    catch (error) {
      if (["invalid-argument", "not-found", "permission-denied", "failed-precondition", "already-exists"].includes(error.code)) {
        throw new HttpsError(error.code, error.message);
      }
      logger.error("Guardian subscription request failed.", {action, callerUid: internalReference,
        studentId: input.studentId, errorCode: error.code || null});
      throw new HttpsError("internal", "Subscription request could not be confirmed. Refresh before trying again.");
    }
  };
  return {
    getOptions: handler("getStripeGuardianSubscriptionOptions"),
    prepare: handler("prepareStripeStudentSubscription", true),
    create: handler("createStripeStudentSubscription", true),
    changePlan: handler("changeStripeStudentSubscriptionPlan", true),
  };
}
const handlers = createGuardianSubscriptionHandlers();
module.exports = {createGuardianSubscriptionHandlers,
  getStripeGuardianSubscriptionOptions: onCall(OPTIONS, handlers.getOptions),
  prepareStripeStudentSubscription: onCall(OPTIONS, handlers.prepare),
  createStripeStudentSubscription: onCall(OPTIONS, handlers.create),
  changeStripeStudentSubscriptionPlan: onCall(OPTIONS, handlers.changePlan)};
