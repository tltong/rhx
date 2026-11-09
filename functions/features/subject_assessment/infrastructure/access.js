const {getAuth} = require("firebase-admin/auth");
const {getFirebaseApp} = require("../../../utils/firebase/firebase_ops");
const {isSiteAdmin} = require("../../site_admin/site_admin_module");
const {problem} = require("../domain/subject_assessment");
async function requireAdministrator(context = {}) {
  if (!context.updatedBy) throw problem("Sign in with a verified administrator account.", "unauthenticated");
  const user = await getAuth(getFirebaseApp()).getUser(context.updatedBy);
  if (user.disabled || !user.emailVerified || !user.email || !await isSiteAdmin(user.email)) throw problem("A verified site administrator is required.", "permission-denied");
  return {uid: user.uid, assertAccess() {}};
}
function createAssessmentAuthorizer({getDb = require("../../../utils/firebase/firebase_ops").getFirestoreDb,
  getUser = uid => getAuth(getFirebaseApp()).getUser(uid), isAdministrator = isSiteAdmin} = {}) {
  return async ({studentId, write = false}, context = {}) => {
    const uid = context.auth?.uid || context.updatedBy;
    if (!uid) throw problem("Sign in to access subject assessments.", "unauthenticated");
    const user = await getUser(uid);
    if (user.disabled) throw problem("This account is disabled.", "permission-denied");
    const administrator = !!(user.emailVerified && user.email && await isAdministrator(user.email));
    if (uid !== studentId && !administrator) {
      if (write) throw problem("Only the student or an administrator may submit answers.", "permission-denied");
      const link = await getDb().collection("guardianStudentLinks").doc(uid + "__" + studentId).get();
      if (link.data()?.state !== "active") throw problem("You cannot access this student's assessments.", "permission-denied");
    }
    if (!administrator) {
      const billing = await getDb().collection("subscriptions").doc(studentId).get();
      const {studentSubscriptionAccess} = require("../../syllabus_subscription/domain/student_subscription_access");
      if (!studentSubscriptionAccess(billing.data()).allowed) throw problem("Your learning subscription is inactive.", "permission-denied");
    }
    return {uid, administrator, canSubmit: uid === studentId || administrator, assertAccess() {}};
  };
}
const authorizeAssessment = createAssessmentAuthorizer();
module.exports = {requireAdministrator, authorizeAssessment, createAssessmentAuthorizer};
