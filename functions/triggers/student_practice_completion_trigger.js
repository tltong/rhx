const {
  onDocumentCreated,
} = require("firebase-functions/v2/firestore");
const {
  assessStudentPractice,
} = require(
  "../features/student_assessment_progress/student_assessment_progress_module",
);
const {
  COMPLETED_PRACTICES_SUBCOLLECTION,
  STUDENT_PRACTICES_COLLECTION,
} = require("../schema/student_practice_schema");

const COMPLETED_STUDENT_PRACTICE_DOCUMENT = [
  STUDENT_PRACTICES_COLLECTION,
  "{studentId}",
  COMPLETED_PRACTICES_SUBCOLLECTION,
  "{practiceId}",
].join("/");

function requireIdentifier(value, fieldName) {
  const identifier = String(value ?? "").trim();

  if (!identifier) {
    throw new Error(`${fieldName} is required.`);
  }

  return identifier;
}

async function assessCompletedStudentPractice({
  studentId,
  practiceId,
} = {}, {
  assessPractice = assessStudentPractice,
} = {}) {
  const normalizedStudentId = requireIdentifier(studentId, "studentId");
  const normalizedPracticeId = requireIdentifier(practiceId, "practiceId");

  return assessPractice({
    studentId: normalizedStudentId,
    practiceId: normalizedPracticeId,
  });
}

const onStudentPracticeCompleted = onDocumentCreated(
  {
    document: COMPLETED_STUDENT_PRACTICE_DOCUMENT,
    region: "us-central1",
  },
  async (event) => assessCompletedStudentPractice({
    studentId: event.params.studentId,
    practiceId: event.params.practiceId,
  }),
);

module.exports = {
  assessCompletedStudentPractice,
  onStudentPracticeCompleted,
};
