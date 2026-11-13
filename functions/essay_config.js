const {onCall, HttpsError} = require("firebase-functions/v2/https");
const feature = require("./features/essay_config/essay_config_module");
function createEssayConfigHandler({apis = feature} = {}) {
  return async request => {
    if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Sign in to administer essays.");
    if (!["getEssayConfiguration", "saveEssayConfiguration"].includes(request.data?.action)) throw new HttpsError("invalid-argument", "Unknown essay configuration operation.");
    try {
      const result = await apis[request.data.action](request.data.input ?? {}, {auth: request.auth});
      return {...result, updatedAt: result.updatedAt?.toDate?.().toISOString() ?? result.updatedAt?.toISOString?.() ?? result.updatedAt};
    } catch (error) {
      if (["invalid-argument", "unauthenticated", "permission-denied", "aborted", "failed-precondition"].includes(error.code)) throw new HttpsError(error.code, error.message);
      console.error("Essay configuration operation failed", error);
      throw new HttpsError("unavailable", "Essay configuration could not be loaded or saved.");
    }
  };
}
module.exports = {createEssayConfigHandler, essayConfig: onCall({region: "us-central1", timeoutSeconds: 60}, createEssayConfigHandler())};
