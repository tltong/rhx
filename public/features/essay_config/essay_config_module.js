import {getFirebaseApp} from "../../utils/firebase/firebase_ops.js";
import {requireCurrentFirebaseAuthUser} from "../../utils/firebase/firebase_auth.js";
import {generatorConfiguration} from "./domain/essay_config.js?v=20261112-essay-variation-v1";
let functionsSdk;
async function functionsApp() {
  const app = getFirebaseApp();
  if (typeof app.functions !== "function") {
    functionsSdk ||= new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "/__/firebase/12.15.0/firebase-functions-compat.js";
      script.onload = () => typeof app.functions === "function" ? resolve() : reject(new Error("Firebase Functions could not initialize."));
      script.onerror = () => reject(new Error("Could not load essay configuration. Retry the request."));
      document.head.append(script);
    }).catch(error => {functionsSdk = null; throw error;});
    await functionsSdk;
  }
  return app;
}
async function request(action, input = {}) {
  const user = requireCurrentFirebaseAuthUser();
  const app = await functionsApp();
  if (requireCurrentFirebaseAuthUser().uid !== user.uid) throw new Error("The signed-in account changed. Reload this page.");
  const response = await app.functions("us-central1").httpsCallable("essayConfig")({action, input});
  if (requireCurrentFirebaseAuthUser().uid !== user.uid) throw new Error("The signed-in account changed. Reload this page.");
  const result = response.data;
  return {...result, updatedAt: result.updatedAt ? new Date(result.updatedAt) : null};
}
export const getEssayConfiguration = () => request("getEssayConfiguration");
export const saveEssayConfiguration = input => request("saveEssayConfiguration", input);
export const getGeneratorConfiguration = async () => generatorConfiguration(await getEssayConfiguration());
