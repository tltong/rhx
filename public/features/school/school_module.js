/** Authenticated Firestore-backed location and school APIs. See docs/school-directory.md. */
import {getFirebaseApp} from "../../utils/firebase/firebase_ops.js";
import {requireCurrentFirebaseAuthUser} from "../../utils/firebase/firebase_auth.js";
async function defaultRequest(action, input) {
  const user = requireCurrentFirebaseAuthUser();
  const response = await getFirebaseApp().functions("us-central1").httpsCallable("schoolCatalog")({action, input});
  if (requireCurrentFirebaseAuthUser().uid !== user.uid) throw new Error("The signed-in account changed. Reload this page.");
  return response.data;
}
function createSchoolFeature({request = defaultRequest} = {}) {
  const api = {};
  for (const action of ["getState", "listStates", "createState", "updateState", "archiveState",
    "getLocality", "listLocalities", "createLocality", "updateLocality", "archiveLocality",
    "getSchool", "listSchools", "createSchool", "updateSchool", "archiveSchool", "assignSchoolStream", "removeSchoolStream", "listSchoolStreams"]) {
    api[action] = (input = {}) => request(action, action.startsWith("get") && typeof input === "string" ? {id: input} : input);
  }
  return api;
}
export {createSchoolFeature};
export const {getState, listStates, createState, updateState, archiveState, getLocality, listLocalities, createLocality,
  updateLocality, archiveLocality, getSchool, listSchools, createSchool, updateSchool, archiveSchool,
  assignSchoolStream, removeSchoolStream, listSchoolStreams} = createSchoolFeature();
