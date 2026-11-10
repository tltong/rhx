/** Student, linked-guardian and administrator APIs. Self-service student credential changes require a recent sign-in. */
import {getFirebaseApp} from "../../utils/firebase/firebase_ops.js";
import {requireCurrentFirebaseAuthUser} from "../../utils/firebase/firebase_auth.js";
let functionsSdk;
async function functionsApp() {
  const app = getFirebaseApp();
  if (typeof app.functions !== "function") {
    // Older student/guardian pages loaded Auth and Firestore only.
    functionsSdk ||= new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "/__/firebase/12.15.0/firebase-functions-compat.js";
      script.onload = () => typeof app.functions === "function" ? resolve() : reject(new Error("Firebase Functions could not initialize."));
      script.onerror = () => reject(new Error("Could not load the student profile service. Retry the request."));
      document.head.append(script);
    }).catch(error => {functionsSdk = null; throw error;});
    await functionsSdk;
  }
  return app;
}
async function defaultRequest(action, input) {
  const user = action === "isStudentUsernameAvailable" ? null : requireCurrentFirebaseAuthUser();
  const app = await functionsApp();
  if (user && requireCurrentFirebaseAuthUser().uid !== user.uid) throw new Error("The signed-in account changed. Reload this page.");
  const response = await app.functions("us-central1").httpsCallable("studentProfile", {timeout: 65000})({action, input});
  if (user && requireCurrentFirebaseAuthUser().uid !== user.uid) throw new Error("The signed-in account changed. Reload this page.");
  return response.data;
}
export function createStudentProfileFeature({request = defaultRequest} = {}) {
  return Object.fromEntries(["getStudentProfile", "getStudentSummary", "createStudentProfile", "updateStudentProfile", "listStudentProfiles", "searchStudentProfiles",
    "isStudentUsernameAvailable", "changeStudentUsername", "getStudentCredentialChange", "retryStudentUsernameChange", "resetStudentPin",
    "linkStudentToGuardian", "updateGuardianStudentLink", "unlinkStudentFromGuardian"]
    .map(action => [action, (input = {}) => request(action, input)]));
}
export const {getStudentProfile, getStudentSummary, createStudentProfile, updateStudentProfile, listStudentProfiles, searchStudentProfiles,
  isStudentUsernameAvailable, changeStudentUsername, getStudentCredentialChange, retryStudentUsernameChange, resetStudentPin} = createStudentProfileFeature();
