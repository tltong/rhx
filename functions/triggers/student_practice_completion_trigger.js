const {
  onDocumentCreated,
} = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");
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
  eventId = null,
  studentId,
  practiceId,
} = {}, {
  assessPractice = assessStudentPractice,
  generatePractice = generateAssessmentPractice,
} = {}) {
  const normalizedStudentId = requireIdentifier(studentId, "studentId");
  const normalizedPracticeId = requireIdentifier(practiceId, "practiceId");
  const context = {
    eventId: String(eventId ?? "").trim() || null,
    studentId: normalizedStudentId,
    practiceId: normalizedPracticeId,
  };

  logger.info("Student practice completion received.", context);

  try {
    logger.info("Student practice assessment started.", context);
    const assessment = await assessPractice({
      studentId: normalizedStudentId,
      practiceId: normalizedPracticeId,
    });

    logger.info("Student practice assessment completed.", {
      ...context,
      assessed: assessment?.assessed === true,
      reason: assessment?.reason || null,
      practiceType: assessment?.practiceType || null,
      syllabusId: assessment?.syllabusId || null,
      topicId: assessment?.topicId || null,
      previousLevelId: assessment?.previousLevelId || null,
      levelId: assessment?.levelId || null,
      levelChanged: assessment?.levelChanged === true,
      isFrameworkCompleted: assessment?.isFrameworkCompleted === true,
    });

    if (
      !assessment
      || assessment.assessed !== true
      || assessment.isFrameworkCompleted === true
    ) {
      logger.info("Next assessment practice generation skipped.", {
        ...context,
        reason: assessment?.isFrameworkCompleted === true
          ? "framework-completed"
          : assessment?.reason || "practice-not-assessed",
      });

      return Object.freeze({
        assessment,
        generation: null,
      });
    }

    const syllabusId = requireIdentifier(assessment.syllabusId, "syllabusId");
    const topicId = requireIdentifier(assessment.topicId, "topicId");

    logger.info("Next assessment practice generation started.", {
      ...context,
      syllabusId,
      topicId,
      levelId: assessment.levelId || null,
    });

    const generation = await generatePractice({
      studentId: normalizedStudentId,
      syllabusId,
      topicId,
    });

    logger.info("Next assessment practice generated and assigned.", {
      ...context,
      syllabusId,
      topicId,
      generatedPracticeId: generation?.practice?.id || null,
    });

    return Object.freeze({
      assessment,
      generation,
    });
  } catch (error) {
    logger.error("Student practice completion processing failed.", {
      ...context,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : null,
    });
    throw error;
  }
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
    eventId: event.id,
    studentId: event.params.studentId,
    practiceId: event.params.practiceId,
  }),
);

module.exports = {
  assessCompletedStudentPractice,
  onStudentPracticeCompleted,
};
