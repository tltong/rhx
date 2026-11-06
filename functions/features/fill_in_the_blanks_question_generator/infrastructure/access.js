const {getAuth} = require("firebase-admin/auth");
const {getFirebaseApp} = require("../../../utils/firebase/firebase_ops");
const {isSiteAdmin} = require("../../site_admin/site_admin_module");
const {problem} = require("../domain/fill_in_the_blanks");
async function requireAdministrator(context = {}) {
  if (context.trusted === true) return context.updatedBy || "system:fill-in-the-blanks";
  if (!context.updatedBy) throw problem("Sign in to administer fill-in-the-blanks practice.", "unauthenticated");
  const user = await getAuth(getFirebaseApp()).getUser(context.updatedBy);
  if (user.disabled || !user.emailVerified || !user.email || !await isSiteAdmin(user.email)) throw problem("A verified site administrator is required.", "permission-denied");
  return user.uid;
}
module.exports = {requireAdministrator};
