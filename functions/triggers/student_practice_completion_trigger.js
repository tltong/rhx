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
  calculateReadinessScore,
  saveReadinessScore,
  calculateSubjectReadinessScore,
  saveSubjectReadinessScore,
} = require("../features/readiness/readiness_module");
const {
  calculateTopicReliabilityScore,
  saveTopicReliabilityScore,
  calculateSubjectReliabilityScore,
  saveSubjectReliabilityScore,
} = require("../features/reliability/reliability_module");
const {
  completionProcessingOutcomes,
} = require(
  "../features/student_practice/domain/practice_completion_processing",
);
const {
  completePracticeCompletionProcessing,
  failPracticeCompletionProcessing,
  markPracticeCompletionGenerating,
  startPracticeCompletionProcessing,
} = require(
  "../features/student_practice/student_practice_module",
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
const COMPLETION_PROCESSING_ERROR_CODE = "COMPLETION_PROCESSING_FAILED";
const completionProcessingOperations = Object.freeze({
  markProcessing: startPracticeCompletionProcessing,
  markGenerating: markPracticeCompletionGenerating,
  markCompleted: completePracticeCompletionProcessing,
  markFailed: failPracticeCompletionProcessing,
});

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
  calculateReadiness = calculateReadinessScore,
  saveReadiness = saveReadinessScore,
  calculateSubjectReadiness = calculateSubjectReadinessScore,
  saveSubjectReadiness = saveSubjectReadinessScore,
  calculateTopicReliability = calculateTopicReliabilityScore,
  saveTopicReliability = saveTopicReliabilityScore,
  calculateSubjectReliability = calculateSubjectReliabilityScore,
  saveSubjectReliability = saveSubjectReliabilityScore,
  processingRepository = completionProcessingOperations,
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
    const processing = await processingRepository.markProcessing(context);

    if (processing?.shouldProcess === false) {
      logger.info("Student practice completion was already processed.", {
        ...context,
      });

      return Object.freeze({
        assessment: null,
        generation: null,
        alreadyProcessed: true,
      });
    }

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

    // Completion is already stored. Update readiness even when level progression
    // is skipped or the framework is complete and no next practice is generated.
    if (assessment?.syllabusId && assessment?.topicId) {
      const readinessScope = {
        studentId: normalizedStudentId,
        syllabusId: requireIdentifier(assessment.syllabusId, "syllabusId"),
        topicId: requireIdentifier(assessment.topicId, "topicId"),
      };
      logger.info("Student topic readiness calculation started.", {
        ...context,
        ...readinessScope,
      });
      const score = await calculateReadiness(readinessScope);

      if (score !== null) {
        const readiness = await saveReadiness({
          ...readinessScope,
          score,
          practiceId: normalizedPracticeId,
        });
        logger.info("Student topic readiness saved.", {
          ...context,
          ...readinessScope,
          score: readiness.score,
        });

        // Read the subject's latest topic scores only after this topic save resolves.
        const subjectReadinessScope = {
          studentId: normalizedStudentId,
          syllabusId: readinessScope.syllabusId,
        };
        logger.info("Student subject readiness calculation started.", {
          ...context,
          ...subjectReadinessScope,
        });
        const subjectScore = await calculateSubjectReadiness(subjectReadinessScope);
        if (subjectScore !== null) {
          const subjectReadiness = await saveSubjectReadiness({
            ...subjectReadinessScope,
            score: subjectScore,
            practiceId: normalizedPracticeId,
          });
          logger.info("Student subject readiness saved.", {
            ...context,
            ...subjectReadinessScope,
            score: subjectReadiness.score,
          });
        }
      }
    }

    // Reliability counts completed practices independently of readiness and
    // progression. Recalculate totals so redeliveries never increment a counter.
    if (assessment?.syllabusId && assessment?.topicId) {
      const reliabilityScope = {
        studentId: normalizedStudentId,
        syllabusId: requireIdentifier(assessment.syllabusId, "syllabusId"),
        topicId: requireIdentifier(assessment.topicId, "topicId"),
      };
      logger.info("Student topic reliability calculation started.", {
        ...context,
        ...reliabilityScope,
      });
      const {score, completedPracticeCount} =
        await calculateTopicReliability(reliabilityScope);
      const reliability = await saveTopicReliability({
        ...reliabilityScope,
        score,
        completedPracticeCount,
      });
      logger.info("Student topic reliability saved.", {
        ...context,
        ...reliabilityScope,
        score: reliability.score,
        completedPracticeCount: reliability.completedPracticeCount,
      });

      // Subject calculation reads the newly saved topic score and includes
      // every current syllabus topic, with missing topic scores contributing zero.
      const subjectReliabilityScope = {
        studentId: normalizedStudentId,
        syllabusId: reliabilityScope.syllabusId,
      };
      logger.info("Student subject reliability calculation started.", {
        ...context,
        ...subjectReliabilityScope,
      });
      const subjectScore =
        await calculateSubjectReliability(subjectReliabilityScope);
      if (subjectScore !== null) {
        const subjectReliability = await saveSubjectReliability({
          ...subjectReliabilityScope,
          score: subjectScore,
        });
        logger.info("Student subject reliability saved.", {
          ...context,
          ...subjectReliabilityScope,
          score: subjectReliability.score,
        });
      }
    }

    if (
      !assessment
      || assessment.assessed !== true
      || assessment.isFrameworkCompleted === true
    ) {
      const outcome = assessment?.isFrameworkCompleted === true
        ? completionProcessingOutcomes.FRAMEWORK_COMPLETED
        : completionProcessingOutcomes.PRACTICE_NOT_ASSESSED;

      await processingRepository.markCompleted({
        ...context,
        generatedPracticeId: null,
        outcome,
      });
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
    await processingRepository.markGenerating(context);

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
    await processingRepository.markCompleted({
      ...context,
      generatedPracticeId: generation?.practice?.id || null,
      outcome: completionProcessingOutcomes.PRACTICE_GENERATED,
    });

    return Object.freeze({
      assessment,
      generation,
    });
  } catch (error) {
    try {
      await processingRepository.markFailed({
        ...context,
        errorCode: COMPLETION_PROCESSING_ERROR_CODE,
      });
    } catch (statusError) {
      logger.error("Practice completion failure status could not be saved.", {
        ...context,
        errorMessage: statusError instanceof Error
          ? statusError.message
          : String(statusError),
        errorStack: statusError instanceof Error ? statusError.stack : null,
      });
    }

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
