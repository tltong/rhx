const {onDocumentCreated} = require("firebase-functions/v2/firestore");
const {subscriptionKey} = require("../features/subject_assessment/domain/student_subject_assessment");

async function processSubscribedSubjectAssessment(event, {
  prepare = require("../features/subject_assessment/subject_assessment_module").prepareSubscribedSubjectAssessment,
} = {}) {
  if (event.type && event.type !== "google.cloud.firestore.document.v1.created") return null;
  if (!event.data?.exists || event.data.data()?.state !== "active") return null;
  const key = subscriptionKey(event.data);
  if (!key) throw new Error("The subscription event has no creation timestamp.");
  return prepare({studentId: event.params.studentId, syllabusId: event.params.syllabusId, subscriptionKey: key});
}

module.exports = {processSubscribedSubjectAssessment,
  onSubjectAssessmentSubscriptionCreated: onDocumentCreated({
    document: "syllabusSubscriptions/{studentId}/syllabuses/{syllabusId}", region: "us-central1",
    memory: "512MiB", timeoutSeconds: 120, retry: true,
  }, processSubscribedSubjectAssessment)};
