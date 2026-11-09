const {onDocumentWritten} = require("firebase-functions/v2/firestore");
async function processSyllabusUnsubscriptionCleanup(event, {clean = require("../features/syllabus_subscription/syllabus_subscription_module").cleanStudentSyllabusAssessments} = {}) {
  const cleanup = event.data?.after?.data()?.cleanup;
  const previous = event.data?.before?.data()?.cleanup;
  if (!cleanup || cleanup.status !== "pending" || (previous?.id === cleanup.id && previous.status === "pending")) return null;
  const result = await clean({studentId: event.params.studentId, syllabusId: event.params.syllabusId, cleanupId: cleanup.id});
  if (result.cleanupStatus === "pending") throw new Error("Assessment cleanup is already running; retry after its lease.");
  return result;
}
module.exports = {processSyllabusUnsubscriptionCleanup,
  onStudentSyllabusUnsubscribed: onDocumentWritten({region: "us-central1", memory: "512MiB", timeoutSeconds: 540, retry: true,
    document: "subjectAssessmentGenerations/_students/students/{studentId}/subjects/{syllabusId}"}, processSyllabusUnsubscriptionCleanup)};
