const { generateDeepseekText } = require("./deepseek");
const {
  createPaymentCustomer,
  deleteCustomer,
} = require("./payment_customer");
const {
  createStripeSetupIntent,
} = require("./stripe_payment_setup_intent");
const {
  createStripeSubscription,
  getStripeSubscriptionPaymentAction,
} = require("./stripe_payment_subscription");
const {
  getStripeClientConfig,
} = require("./stripe_payment_client_config");
const {
  stripeTestWebhook,
} = require("./stripe_test_webhook");
const {
  stripeProdWebhook,
} = require("./stripe_prod_webhook");
const {
  addSiteAdminEmail,
  isCurrentUserSiteAdmin,
  listSiteAdminEmails,
  removeSiteAdminEmail,
} = require("./site_admin");
const {
  onSyllabusSubscriptionCreated,
} = require("./triggers/syllabus_subscription_trigger");
const {
  onStudentPracticeCompleted,
} = require("./triggers/student_practice_completion_trigger");

exports.generateDeepseekText = generateDeepseekText;
exports.createPaymentCustomer = createPaymentCustomer;
exports.deleteCustomer = deleteCustomer;
exports.createStripeSetupIntent = createStripeSetupIntent;
exports.createStripeSubscription = createStripeSubscription;
exports.getStripeSubscriptionPaymentAction =
  getStripeSubscriptionPaymentAction;
exports.getStripeClientConfig = getStripeClientConfig;
exports.stripeTestWebhook = stripeTestWebhook;
exports.stripeProdWebhook = stripeProdWebhook;
exports.addSiteAdminEmail = addSiteAdminEmail;
exports.isCurrentUserSiteAdmin = isCurrentUserSiteAdmin;
exports.listSiteAdminEmails = listSiteAdminEmails;
exports.removeSiteAdminEmail = removeSiteAdminEmail;
exports.onSyllabusSubscriptionCreated = onSyllabusSubscriptionCreated;
exports.onStudentPracticeCompleted = onStudentPracticeCompleted;
