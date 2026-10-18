/**
 * Admin-only topic reset feature APIs. Generated questions/practice definitions, coins,
 * login records, subscriptions and all other topics' student work are preserved.
 * previewStudentTopicPracticeReset({studentId, syllabusId, topicId}, {updatedBy})
 * requestStudentTopicPracticeReset({studentId, syllabusId, topicId, resetId}, {updatedBy})
 * getStudentTopicPracticeResetStatus({studentId, resetId}, {updatedBy})
 * Requests are resumable by resetId. The student remains in maintenance after a failed
 * partial reset until an administrator resumes it. Nothing is automatically reassigned.
 * Old subject snapshots sourced by removed practices are deleted; other snapshots remain.
 */
const {getAuth} = require("firebase-admin/auth");
const firebaseOps = require("../../utils/firebase/firebase_ops");
const {getStudentById} = require("../student/student_module");
const {getSyllabusById} = require("../syllabus/syllabus_module");
const {getPracticeById} = require("../practice/practice_module");
const {isSiteAdmin} = require("../site_admin/site_admin_module");
const {calculateSubjectReadinessScore} = require("../readiness/readiness_module");
const {calculateSubjectReliabilityScore} = require("../reliability/reliability_module");
const {identifier, resetError} = require("./domain/reset_scope");
const {BuildResetPlan} = require("./application/build_reset_plan");
const {FirestoreTopicResetRepository} = require("./infrastructure/firestore_topic_reset_repository");
const {ResetStudentTopicPractices} = require("./application/reset_student_topic_practices");
async function requireAdministrator(context) {
  const uid = identifier(context?.updatedBy, "updatedBy");
  const user = await getAuth(firebaseOps.getFirebaseApp()).getUser(uid);
  if (user.disabled || !user.emailVerified || !user.email || !await isSiteAdmin(user.email)) {
    throw resetError("permission-denied", "A verified site-administrator account is required.");
  }
  return {uid};
}
const useCase = new ResetStudentTopicPractices({
  requireAdministrator, repository: new FirestoreTopicResetRepository(),
  planner: new BuildResetPlan({getFirestoreDb: firebaseOps.getFirestoreDb, getStudentById, getSyllabusById, getPracticeById}),
  calculateSubjectReadinessScore, calculateSubjectReliabilityScore,
});
module.exports = {
  previewStudentTopicPracticeReset: (input, context) => useCase.preview(input, context),
  requestStudentTopicPracticeReset: (input, context) => useCase.request(input, context),
  getStudentTopicPracticeResetStatus: (input, context) => useCase.status(input, context),
};
