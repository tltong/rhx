const {onDocumentWritten} = require("firebase-functions/v2/firestore");
const {deepseekApiKey} = require("../deepseek");
const {openaiApiKey} = require("../utils/llm/openai_util");
async function processStudentSubjectAssessmentGeneration(event, {generate = require("../features/subject_assessment/subject_assessment_module").generateStudentSubjectAssessment,
  getJob = async generationId => (await require("../utils/firebase/firebase_ops").getFirestoreDb().collection("subjectAssessmentGenerations").doc(generationId).get()).data()} = {}) {
  const before = event.data?.before?.data(), after = event.data?.after?.data();
  if (after?.entryPoint !== "student" || after.status !== "queued" || !after.generationRequest || before?.generationRequest === after.generationRequest) return null;
  try {return await generate(event.params.generationId, after.generationRequest);}
  catch (error) {
    if (["generation-lease-lost", "generation-request-superseded"].includes(error.code)) return null;
    if (error.code === "generation-in-progress") throw error;
    const latest = await getJob(event.params.generationId);
    if (!latest || latest.status === "failed" || latest.generationRequest !== after.generationRequest) return null;
    throw error;
  }
}
const onStudentSubjectAssessmentRequested = onDocumentWritten({document: "subjectAssessmentGenerations/{generationId}",
  region: "us-central1", memory: "1GiB", timeoutSeconds: 540, minInstances: 0, secrets: [deepseekApiKey, openaiApiKey], retry: true}, processStudentSubjectAssessmentGeneration);
module.exports = {processStudentSubjectAssessmentGeneration, onStudentSubjectAssessmentRequested};
