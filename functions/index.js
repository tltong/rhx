const { generateDeepseekText } = require("./deepseek");
const guardianSubscriptionFunctions = require("./stripe_guardian_subscriptions");
exports.getStripeGuardianSubscriptionOptions = guardianSubscriptionFunctions.getStripeGuardianSubscriptionOptions;
exports.prepareStripeStudentSubscription = guardianSubscriptionFunctions.prepareStripeStudentSubscription;
exports.createStripeStudentSubscription = guardianSubscriptionFunctions.createStripeStudentSubscription;
exports.changeStripeStudentSubscriptionPlan = guardianSubscriptionFunctions.changeStripeStudentSubscriptionPlan;
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
  retryStripeSubscriptionPayment,
  getStripeSubscriptionPaymentDetails,
  updateStripeSubscriptionPaymentMethod,
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
exports.generateLlmImage = require("./image_generation_http").generateLlmImage;
exports.extractLlmImageText = require("./image_ocr_http").extractLlmImageText;
exports.processImageOcrJob = require("./image_ocr_jobs_trigger").processImageOcrJob;
exports.createPaymentCustomer = createPaymentCustomer;
exports.deleteCustomer = deleteCustomer;
exports.createStripeSetupIntent = createStripeSetupIntent;
exports.createStripeSubscription = createStripeSubscription;
exports.getStripeSubscriptionPaymentAction =
  getStripeSubscriptionPaymentAction;
exports.retryStripeSubscriptionPayment = retryStripeSubscriptionPayment;
exports.getStripeSubscriptionPaymentDetails = getStripeSubscriptionPaymentDetails;
exports.updateStripeSubscriptionPaymentMethod = updateStripeSubscriptionPaymentMethod;
exports.getStripeClientConfig = getStripeClientConfig;
exports.listStripeCustomers =
  require("./stripe_customer_list").listStripeCustomers;
exports.stripeTestWebhook = stripeTestWebhook;
exports.stripeProdWebhook = stripeProdWebhook;
exports.retryStripeRenewals = require("./stripe_renewal_retry_scheduler").retryStripeRenewals;
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
exports.manageStripeRenewalRecovery = require("./stripe_renewal_recovery").manageStripeRenewalRecovery;

exports.onStudentFillInTheBlanksPracticeSubmitted = require("./triggers/student_fill_in_the_blanks_practice_submission_trigger").onStudentFillInTheBlanksPracticeSubmitted;
exports.onStudentFillInTheBlanksPracticeCompleted = require("./triggers/student_fill_in_the_blanks_practice_completion_trigger").onStudentFillInTheBlanksPracticeCompleted;
exports.subjectAssessment = require("./subject_assessment").subjectAssessment;
exports.schoolCatalog = require("./school_catalog").schoolCatalog;
exports.studentProfile = require("./student_profile").studentProfile;
exports.onStudentUsernameChangeRequested = require("./triggers/student_username_change_trigger").onStudentUsernameChangeRequested;
exports.retryStudentUsernameChanges = require("./student_username_change_scheduler").retryStudentUsernameChanges;
exports.onSubjectAssessmentSubmitted = require("./triggers/subject_assessment_submission_trigger").onSubjectAssessmentSubmitted;
exports.onStudentSubjectAssessmentRequested = require("./triggers/student_subject_assessment_generation_trigger").onStudentSubjectAssessmentRequested;
exports.unsubscribeStudentSyllabus = require("./syllabus_subscription").unsubscribeStudentSyllabus;
exports.onStudentSyllabusUnsubscribed = require("./triggers/syllabus_unsubscription_cleanup_trigger").onStudentSyllabusUnsubscribed;
exports.onSubjectAssessmentSubscriptionCreated = require("./triggers/subscribed_subject_assessment_trigger").onSubjectAssessmentSubscriptionCreated;

exports.essayConfig = require("./essay_config").essayConfig;
