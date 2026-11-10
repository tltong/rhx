const {onCall, HttpsError} = require("firebase-functions/v2/https");
const feature = require("./features/student/student_profile_module");
const ACTIONS = Object.freeze(["getStudentProfile", "getStudentSummary", "createStudentProfile", "updateStudentProfile", "listStudentProfiles", "searchStudentProfiles",
  "isStudentUsernameAvailable", "changeStudentUsername", "getStudentCredentialChange", "retryStudentUsernameChange", "resetStudentPin",
  "linkStudentToGuardian", "updateGuardianStudentLink", "unlinkStudentFromGuardian"]);
function createStudentProfileHandler({apis = feature} = {}) {
  return async request => {
    const action = request.data?.action;
    if (!ACTIONS.includes(action)) throw new HttpsError("invalid-argument", "Unknown student profile operation.");
    if (action !== "isStudentUsernameAvailable" && !request.auth?.uid) throw new HttpsError("unauthenticated", "Sign in to access student details.");
    try {return await apis[action](request.data.input ?? {}, {auth: request.auth});}
    catch (error) {
      if (["invalid-argument", "unauthenticated", "permission-denied", "not-found", "failed-precondition", "aborted", "already-exists", "resource-exhausted"].includes(error.code)) throw new HttpsError(error.code, error.message);
      // Never log request input or raw Auth errors: the request may contain a PIN.
      console.error("Student profile operation failed", {action, code: String(error.code || "unknown").slice(0, 100)});
      throw new HttpsError("unavailable", action === "resetStudentPin" ? "The PIN reset could not be confirmed. Retry with the same new PIN; it may already have changed." : "The request could not finish. Reload its status before retrying.");
    }
  };
}
module.exports = {createStudentProfileHandler, studentProfile: onCall({region: "us-central1", timeoutSeconds: 60}, createStudentProfileHandler())};
