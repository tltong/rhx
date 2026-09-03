const { generateDeepseekText } = require("./deepseek");
const {
  createPaymentCustomer,
  deleteCustomer,
} = require("./payment_customer");
const {
  createStripeSetupIntent,
} = require("./stripe_payment_setup_intent");
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
exports.addSiteAdminEmail = addSiteAdminEmail;
exports.isCurrentUserSiteAdmin = isCurrentUserSiteAdmin;
exports.listSiteAdminEmails = listSiteAdminEmails;
exports.removeSiteAdminEmail = removeSiteAdminEmail;
exports.onSyllabusSubscriptionCreated = onSyllabusSubscriptionCreated;
exports.onStudentPracticeCompleted = onStudentPracticeCompleted;
