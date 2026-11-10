const {getAuth} = require("firebase-admin/auth");
const {getFirebaseApp} = require("../../../utils/firebase/firebase_ops");
const {isSiteAdmin} = require("../../site_admin/site_admin_module");
const {problem} = require("../domain/school");
function createSchoolAuthorizer({getUser = uid => getAuth(getFirebaseApp()).getUser(uid), isAdministrator = isSiteAdmin} = {}) {
  return async ({write = false} = {}, context = {}) => {
    const uid = context.auth?.uid || context.updatedBy;
    if (!uid) throw problem("Sign in to access the school directory.", "unauthenticated");
    const user = await getUser(uid);
    if (user.disabled) throw problem("This account is disabled.", "permission-denied");
    const administrator = !!(user.emailVerified && user.email && await isAdministrator(user.email));
    if (write && !administrator) throw problem("A verified site administrator is required.", "permission-denied");
    return {uid, administrator};
  };
}
module.exports = {createSchoolAuthorizer};
