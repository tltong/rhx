const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {onDocumentWritten} = require("firebase-functions/v2/firestore");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const {deepseekApiKey} = require("./utils/llm/deepseek_util");
const {openaiApiKey} = require("./utils/llm/openai_util");
const {FirestoreDemoRepository} = require("./features/demo/infrastructure/firestore_demo_repository");
const d = require("./features/demo/domain/demo");
const ACTIONS = Object.freeze(["startDemo", "getCatalog", "saveSetup", "getSubjects", "preparePractice", "getPractice",
  "getFillInTheBlanksAnswers", "submitPractice", "cancelPractice", "getTutor", "checkTutor", "getNewsOptions", "prepareNews", "getNewsQuestions",
  "submitNewsQuestions", "getNewsVocabulary", "requestNewsMeaning", "getNewsMeaning", "finishDemo"]);
let feature;
function apis() {return feature ||= require("./features/demo/demo_module").createDemoFeature();}
function wire(value) {
  if (value?.toDate) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(wire);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([name, item]) => [name, wire(item)]));
  return value;
}
function createDemoHandler({getFeature = apis} = {}) {
  return async request => {
    try {
      d.fields(request.data, ["action", "token", "input"]);
      if (!ACTIONS.includes(request.data.action)) throw d.fail("Unknown demo operation.");
      const result = await getFeature()[request.data.action](request.data.token, request.data.input || {},
        {sender: d.hash(request.rawRequest?.ip || "unknown")});
      return wire(result);
    } catch (error) {
      if (["invalid-argument", "unauthenticated", "permission-denied", "failed-precondition", "not-found",
        "resource-exhausted", "already-exists", "aborted"].includes(error.code)) throw new HttpsError(error.code, error.message);
      require("firebase-functions/logger").warn("Demo request failed", {action: request.data?.action, code: error.code || "internal"});
      throw new HttpsError("unavailable", "The demo could not complete this request. Please retry.");
    }
  };
}
async function processDemoPractice(event, {getFeature = apis} = {}) {
  const before = event.data?.before?.data(), after = event.data?.after?.data();
  if (after?.status !== "queued" || !after.requestSequence || before?.requestSequence === after.requestSequence) return null;
  return getFeature().runPractice(event.params.sessionId, event.params.attemptId, after.requestSequence);
}
module.exports = {
  ACTIONS, createDemoHandler, processDemoPractice,
  demo: onCall({region: "us-central1", timeoutSeconds: 180, memory: "512MiB", maxInstances: 10,
    secrets: [deepseekApiKey, openaiApiKey]}, createDemoHandler()),
  onDemoPracticeRequested: onDocumentWritten({document: "demoSessions/{sessionId}/attempts/{attemptId}",
    region: "us-central1", timeoutSeconds: 540, memory: "1GiB", concurrency: 1, maxInstances: 5,
    secrets: [deepseekApiKey, openaiApiKey], retry: true}, processDemoPractice),
  cleanupDemoSessions: onSchedule({schedule: "every 30 minutes", region: "us-central1", timeoutSeconds: 540, maxInstances: 1},
    () => new FirestoreDemoRepository().cleanup()),
};
