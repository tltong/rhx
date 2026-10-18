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
const {
  pruneStudentLoginHistoryDaily,
} = require("./triggers/student_login_history_cleanup_trigger");
const {
  onStudentLoginRecorded,
} = require("./triggers/student_login_reward_trigger");

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
exports.onStudentEssayPracticeCompleted = require("./triggers/student_essay_practice_completion_trigger").onStudentEssayPracticeCompleted;
exports.pruneStudentLoginHistoryDaily = pruneStudentLoginHistoryDaily;
exports.onStudentLoginRecorded = onStudentLoginRecorded;
exports.studentTopicPracticeReset = require("./student_topic_practice_reset_http").studentTopicPracticeReset;
