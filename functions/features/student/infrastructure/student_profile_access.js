const {getAuth} = require("firebase-admin/auth");
const {getFirebaseApp, getFirestoreDb} = require("../../../utils/firebase/firebase_ops");
const {isSiteAdmin} = require("../../site_admin/site_admin_module");
const {problem} = require("../domain/student_profile");
function createStudentProfileAuthorizer({getDb = getFirestoreDb, getUser = uid => getAuth(getFirebaseApp()).getUser(uid), isAdministrator = isSiteAdmin, now = () => new Date()} = {}) {
  return async ({studentId, write = false, credential = false, administratorOnly = false, lookup = false, create = false} = {}, context = {}) => {
    const uid = context.auth?.uid;
    if (!uid) throw problem("Sign in to access student details.", "unauthenticated");
    let user;
    try {user = await getUser(uid);}
    catch (error) {
      if (error.code === "auth/user-not-found") throw problem("This account is no longer available.", "permission-denied");
      throw error;
    }
    if (user.disabled) throw problem("This account is disabled.", "permission-denied");
    const administrator = !!(user.emailVerified && user.email && await isAdministrator(user.email));
    if (administrator) return {uid, administrator, user};
    if (administratorOnly) throw problem("A verified site administrator is required.", "permission-denied");
    const permitted = access => {
      // An active guardian link authorizes edits in the existing signed-in
      // guardian session. Only students changing their own login need recency.
      if (credential && access.self) {
        const authenticated = context.auth?.token?.auth_time, age = +now() / 1000 - authenticated;
        if (!Number.isFinite(authenticated) || age < -60 || age > 300) throw problem("Sign in again before changing login credentials.", "failed-precondition");
      }
      return access;
    };
    if (uid === studentId) return permitted({uid, administrator: false, self: true, user});
    const db = getDb();
    const guardian = await db.doc("guardians/" + uid).get();
    if (lookup && guardian.exists && !write) return {uid, administrator: false, guardian: true, user};
    if (!create && guardian.exists && studentId && (await db.doc("guardianStudentLinks/" + uid + "__" + studentId).get()).data()?.state === "active") return permitted({uid, administrator: false, guardian: true, user});
    throw problem("You cannot access this student's details.", "permission-denied");
  };
}
async function recheckStudentAccess(tx, db, access, studentId) {
  if (!access.guardian || access.administrator) return;
  const [guardian, link] = await Promise.all([tx.get(db.doc("guardians/" + access.uid)), tx.get(db.doc("guardianStudentLinks/" + access.uid + "__" + studentId))]);
  if (!guardian.exists || link.data()?.state !== "active") throw problem("This guardian link is no longer active.", "permission-denied");
}
module.exports = {createStudentProfileAuthorizer, recheckStudentAccess};
