const {onCall, HttpsError} = require("firebase-functions/v2/https");
function createUnsubscribeStudentSyllabusHandler({execute = require("./features/syllabus_subscription/syllabus_subscription_module").unsubscribeStudentSyllabus} = {}) {
  return async request => {
    if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Sign in to manage syllabus subscriptions.");
    try {return await execute(request.data, {auth: request.auth});}
    catch (error) {
      const safe = ["invalid-argument", "permission-denied", "unauthenticated", "failed-precondition", "not-found"];
      if (safe.includes(error.code)) throw new HttpsError(error.code, error.message);
      throw new HttpsError("unavailable", "Unsubscription could not finish. Retry to check its status and resume assessment cleanup.");
    }
  };
}
module.exports = {createUnsubscribeStudentSyllabusHandler,
  unsubscribeStudentSyllabus: onCall({region: "us-central1", memory: "512MiB", timeoutSeconds: 540}, createUnsubscribeStudentSyllabusHandler())};
