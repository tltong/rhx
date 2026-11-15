import {getFirebaseApp} from "../../utils/firebase/firebase_ops.js";
import {requireCurrentFirebaseAuthUser} from "../../utils/firebase/firebase_auth.js";
export {createDefaultNewsConfiguration, normalizeNewsConfiguration, resolveNewsGradeSettings} from "./domain/news_config.js?v=20261115-news-student-v1";

let functionsSdk;
async function functionsApp() {
  const app = getFirebaseApp();
  if (typeof app.functions !== "function") {
    functionsSdk ||= new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "/__/firebase/12.15.0/firebase-functions-compat.js";
      script.onload = () => typeof app.functions === "function" ? resolve() : reject(new Error("Firebase Functions could not initialize."));
      script.onerror = () => {script.remove(); reject(new Error("Could not load news configuration. Retry the request."));};
      document.head.append(script);
    }).catch(error => {functionsSdk = null; throw error;});
    await functionsSdk;
  }
  return app;
}
export function createStudentNewsFeature({getApp = functionsApp, requireUser = requireCurrentFirebaseAuthUser} = {}) {
  async function request(action, input = {}) {
    const user = requireUser();
    function assertAccount() {
      const current = requireUser();
      if (current.uid !== user.uid || current.email !== user.email || current.emailVerified !== user.emailVerified) throw new Error("The signed-in account changed. Reload this page.");
    }
    const app = await getApp(); assertAccount();
    const response = await app.functions("us-central1").httpsCallable("studentNews")({action, input});
    assertAccount();
    return {...response.data, updatedAt: response.data.updatedAt ? new Date(response.data.updatedAt) : null};
  }
  return {getNewsConfiguration: () => request("getNewsConfiguration"), saveNewsConfiguration: input => request("saveNewsConfiguration", input),
    ...Object.fromEntries(["getNewsPreviewOptions", "generateNewsPreview", "requestNewsPreviewLanguage", "getNewsPreview", "retryNewsPreview", "addNewsPreviewToPool", "listNewsStories", "retireNewsStory", "getStudentNewsOverview", "listStudentNewsHistory", "requestStudentNews", "getStudentNewsAssignment", "requestStudentNewsLanguage", "retryStudentNews", "finishStudentNews", "getNewsVocabulary", "requestNewsMeaning", "getNewsMeaning", "getNewsQuestions", "submitNewsQuestions"].map(action => [action, input => request(action, input || {})]))};
}
export const {getNewsConfiguration, saveNewsConfiguration, getNewsPreviewOptions, generateNewsPreview, requestNewsPreviewLanguage, getNewsPreview, retryNewsPreview, addNewsPreviewToPool, listNewsStories, retireNewsStory,
  getStudentNewsOverview, listStudentNewsHistory, requestStudentNews, getStudentNewsAssignment, requestStudentNewsLanguage, retryStudentNews, finishStudentNews, getNewsVocabulary, requestNewsMeaning, getNewsMeaning, getNewsQuestions, submitNewsQuestions} = createStudentNewsFeature();
