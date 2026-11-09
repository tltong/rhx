const {onDocumentWritten} = require("firebase-functions/v2/firestore");
const {deepseekApiKey} = require("../deepseek");
const {openaiApiKey} = require("../utils/llm/openai_util");
async function processSubjectAssessmentSubmission(event, {mark = require("../features/subject_assessment/subject_assessment_module").markSubjectAssessmentSubmission,
  getStatus = async assessmentId => (await require("../utils/firebase/firebase_ops").getFirestoreDb()
    .collection("subjectAssessmentSubmissions").doc(assessmentId).get()).data()?.markingStatus} = {}) {
  const before = event.data?.before?.data(), after = event.data?.after?.data();
  if (after?.status !== "submitted" || !after.markingRequest || (before?.status === "submitted" && before.markingRequest === after.markingRequest)) return null;
  try {return await mark(event.params.assessmentId, {markingRequest: after.markingRequest});}
  catch (error) {
    if (error.code === "marking-lease-lost") return null;
    if (error.code === "marking-in-progress") throw error;
    // Recorded failures await an explicit retry; infrastructure failures remain retryable.
    if (await getStatus(event.params.assessmentId) === "failed") return null;
    throw error;
  }
}
const onSubjectAssessmentSubmitted = onDocumentWritten({document: "subjectAssessmentSubmissions/{assessmentId}",
  region: "us-central1", memory: "1GiB", timeoutSeconds: 540, minInstances: 0, secrets: [deepseekApiKey, openaiApiKey], retry: true}, processSubjectAssessmentSubmission);
module.exports = {processSubjectAssessmentSubmission, onSubjectAssessmentSubmitted};
