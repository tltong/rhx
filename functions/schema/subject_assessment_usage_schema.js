const SUBJECT_ASSESSMENT_USAGE = "studentSubjectAssessmentUsage";
const subjectAssessmentUsageSchema = {
  collection: "studentSubjectAssessmentUsage/{studentId}/items", documentId: "{sourceKey}",
  fields: {sourceKey: "SHA-256 content identity", identity: "format-qualified pool identity", sourceReference: "pool document path",
    questionType: "normal|essay|fillInTheBlanks", syllabusId: "string", topicId: "string", language: "string",
    assessmentId: "string", selectedAt: "timestamp"},
  description: "Persistent subject-assessment usage, atomically published with the assessment. Regular assigned/completed history is read separately.",
};
module.exports = {SUBJECT_ASSESSMENT_USAGE, subjectAssessmentUsageSchema};
