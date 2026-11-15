const {getAuth} = require("firebase-admin/auth");
const {getFirebaseApp} = require("../../../utils/firebase/firebase_ops");
const {isSiteAdmin} = require("../../site_admin/site_admin_module");
const {fail} = require("../domain/news_config");

function requireSignedIn(context) {
  if (!context?.auth?.uid) throw fail("Sign in to access news configuration.", "unauthenticated");
  return context.auth.uid;
}
function createNewsAdministratorAccess({getUser = uid => getAuth(getFirebaseApp()).getUser(uid), isAdministrator = isSiteAdmin} = {}) {
  return async context => {
    const uid = requireSignedIn(context);
    let user;
    try {user = await getUser(uid);} catch (error) {
      if (["auth/user-not-found", "auth/user-disabled"].includes(error.code)) throw fail("A verified site administrator is required.", "permission-denied");
      throw error;
    }
    if (user.disabled || !user.emailVerified || !user.email || !await isAdministrator(user.email)) throw fail("A verified site administrator is required.", "permission-denied");
    return uid;
  };
}
module.exports = {requireSignedIn, createNewsAdministratorAccess, requireNewsAdministrator: createNewsAdministratorAccess()};
