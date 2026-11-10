const {onCall, HttpsError} = require("firebase-functions/v2/https");
const feature = require("./features/school/school_module");
const ACTIONS = Object.freeze(["getState", "listStates", "createState", "updateState", "archiveState",
  "getLocality", "listLocalities", "createLocality", "updateLocality", "archiveLocality",
  "getSchool", "listSchools", "createSchool", "updateSchool", "archiveSchool", "assignSchoolStream", "removeSchoolStream", "listSchoolStreams"]);
function createSchoolCatalogHandler({apis = feature} = {}) {
  return async request => {
    if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Sign in to access the school directory.");
    if (!ACTIONS.includes(request.data?.action)) throw new HttpsError("invalid-argument", "Unknown school directory operation.");
    try {return await apis[request.data.action](request.data.input ?? {}, {auth: request.auth});}
    catch (error) {
      if (["invalid-argument", "unauthenticated", "permission-denied", "not-found", "failed-precondition", "aborted", "already-exists"].includes(error.code)) {
        throw new HttpsError(error.code, error.message);
      }
      console.error("School directory operation failed", error);
      throw new HttpsError("unavailable", "The school directory request could not finish. Reload the list before retrying a write.");
    }
  };
}
module.exports = {createSchoolCatalogHandler,
  schoolCatalog: onCall({region: "us-central1", timeoutSeconds: 60}, createSchoolCatalogHandler())};
