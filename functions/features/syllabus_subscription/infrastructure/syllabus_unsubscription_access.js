const {getAuth} = require("firebase-admin/auth");
const {getFirebaseApp, getFirestoreDb} = require("../../../utils/firebase/firebase_ops");
const {isSiteAdmin} = require("../../site_admin/site_admin_module");
const {problem} = require("../../subject_assessment/domain/subject_assessment");

function createUnsubscriptionAuthorizer({getDb = getFirestoreDb,
  getUser = uid => getAuth(getFirebaseApp()).getUser(uid), isAdministrator = isSiteAdmin} = {}) {
  return async (studentId, context = {}) => {
    const uid = context.auth?.uid;
    if (!uid) throw problem("Sign in to manage syllabus subscriptions.", "unauthenticated");
    const user = await getUser(uid);
    if (user.disabled) throw problem("This account is disabled.", "permission-denied");
    if (user.emailVerified && user.email && await isAdministrator(user.email)) return {uid, administrator: true};
    const [guardian, link] = await Promise.all([getDb().doc("guardians/" + uid).get(),
      getDb().doc("guardianStudentLinks/" + uid + "__" + studentId).get()]);
    if (!guardian.exists || link.data()?.state !== "active") {
      throw problem("An actively linked guardian or site administrator is required.", "permission-denied");
    }
    return {uid, administrator: false};
  };
}

module.exports = {createUnsubscriptionAuthorizer};
