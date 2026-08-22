const {
  onDocumentCreated,
} = require("firebase-functions/v2/firestore");
const {
  assessStudentPractice,
} = require(
  "../features/student_assessment_progress/student_assessment_progress_module",
);
const {
  generateAssessmentPractice,
} = require(
  "../features/practice_generator/practice_generator_module",
);
const {
  deepseekApiKey,
} = require("../deepseek");
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
  generatePractice = generateAssessmentPractice,
} = {}) {
  const normalizedStudentId = requireIdentifier(studentId, "studentId");
  const normalizedPracticeId = requireIdentifier(practiceId, "practiceId");
  const assessment = await assessPractice({
    studentId: normalizedStudentId,
    practiceId: normalizedPracticeId,
  });

  if (
    !assessment
    || assessment.assessed !== true
    || assessment.isFrameworkCompleted === true
  ) {
    return Object.freeze({
      assessment,
      generation: null,
    });
  }

  const generation = await generatePractice({
    studentId: normalizedStudentId,
    syllabusId: requireIdentifier(assessment.syllabusId, "syllabusId"),
    topicId: requireIdentifier(assessment.topicId, "topicId"),
  });

  return Object.freeze({
    assessment,
    generation,
  });
}

const onStudentPracticeCompleted = onDocumentCreated(
  {
    document: COMPLETED_STUDENT_PRACTICE_DOCUMENT,
    memory: "1GiB",
    region: "us-central1",
    secrets: [deepseekApiKey],
    timeoutSeconds: 540,
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
