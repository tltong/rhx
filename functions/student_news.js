const {onCall, HttpsError} = require("firebase-functions/v2/https");
const feature = require("./features/student_news/student_news_module");
const ACTIONS = Object.freeze(["getNewsConfiguration", "saveNewsConfiguration", "getNewsPreviewOptions", "generateNewsPreview", "requestNewsPreviewLanguage", "getNewsPreview", "retryNewsPreview", "addNewsPreviewToPool", "listNewsStories", "retireNewsStory",
  "getStudentNewsOverview", "listStudentNewsHistory", "requestStudentNews", "getStudentNewsAssignment", "requestStudentNewsLanguage", "retryStudentNews", "finishStudentNews", "getNewsVocabulary", "requestNewsMeaning", "getNewsMeaning", "getNewsQuestions", "submitNewsQuestions"]);
function wire(value) {
  if (value?.toDate) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(wire);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([name, item]) => [name, wire(item)]));
  return value;
}
function createStudentNewsHandler({apis = feature} = {}) {
  return async request => {
    if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Sign in to access news configuration.");
    const action = request.data?.action;
    if (!ACTIONS.includes(action)) throw new HttpsError("invalid-argument", "Unknown student news operation.");
    try {
      const result = await apis[action](request.data.input ?? {}, {auth: request.auth});
      return wire({...result, updatedAt: result.updatedAt || null});
    } catch (error) {
      if (["invalid-argument", "unauthenticated", "permission-denied", "aborted", "failed-precondition", "not-found", "already-exists", "resource-exhausted"].includes(error.code)) throw new HttpsError(error.code, error.message);
      console.error("Student news configuration operation failed", error);
      throw new HttpsError("unavailable", "The news operation could not be completed. Try again.");
    }
  };
}
module.exports = {createStudentNewsHandler, studentNews: onCall({region: "us-central1", timeoutSeconds: 60}, createStudentNewsHandler())};
