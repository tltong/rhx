const STUDENT_FILL_IN_THE_BLANKS_GENERATIONS = "studentFillInTheBlanksPracticeGenerations";
const generationFields = {
  syllabusId: "string", topicId: "string", status: "generating|completed|failed",
  nextPracticeId: "string|null", outcome: "assigned|framework-completed (on completion)",
  passageId: "string|null", passageSource: "reused|generated|null", draftId: "string|null",
  startedAt: "timestamp", updatedAt: "timestamp", completedAt: "timestamp|null",
  leaseToken: "string|null", leaseUntil: "timestamp|null", errorCode: "string|null", errorMessage: "string|null",
};
const studentFillInTheBlanksGenerationSchema = {
  collection: STUDENT_FILL_IN_THE_BLANKS_GENERATIONS, documentId: "{studentId}",
  subcollections: {
    completions: {documentId: "{completedPracticeId}", fields: generationFields},
    initials: {documentId: "initial-{stableAttachmentHash}", fields: generationFields},
  },
};
export {STUDENT_FILL_IN_THE_BLANKS_GENERATIONS, studentFillInTheBlanksGenerationSchema};
