import {
  StudentAssessmentTopicProgress
} from "../domain/student_assessment_topic_progress.js?v=20260813-pre-assessment-progress";

function requireFunction(value, name) {
  if (typeof value !== "function") {
    throw new Error(`${name} must be a function.`);
  }

  return value;
}

function requireIdentifier(value, fieldName) {
  const identifier = String(value ?? "").trim();

  if (!identifier) {
    throw new Error(`${fieldName} is required.`);
  }

  return identifier;
}

function getPracticeScope(practice) {
  if (!Array.isArray(practice.questions) || practice.questions.length === 0) {
    throw new Error("The completed practice has no question references.");
  }

  const syllabusIds = new Set(
    practice.questions.map((question) => question.syllabusId)
  );
  const topicIds = new Set(
    practice.questions.map((question) => question.topicId)
  );

  if (syllabusIds.size !== 1 || topicIds.size !== 1) {
    throw new Error(
      "A pre-assessment practice must contain questions for exactly one syllabus and topic."
    );
  }

  return {
    syllabusId: requireIdentifier([...syllabusIds][0], "syllabusId"),
    topicId: requireIdentifier([...topicIds][0], "topicId")
  };
}

function createSkippedOutcome({
  studentId,
  reason,
  practiceResult = null,
  practice = null
}) {
  return Object.freeze({
    assessed: false,
    reason,
    studentId,
    practiceId: practiceResult?.practiceId || null,
    practiceType: practice?.type || null,
    score: practiceResult?.score ?? null,
    progress: null
  });
}

export class AssessStudentPractice {
  constructor({
    studentAssessmentProgressRepository,
    getPracticeResult,
    getPracticeById,
    getSyllabusById,
    calculatePreAssessmentLevel,
    preAssessmentPracticeType
  } = {}) {
    if (!studentAssessmentProgressRepository) {
      throw new Error("studentAssessmentProgressRepository is required.");
    }

    this.studentAssessmentProgressRepository =
      studentAssessmentProgressRepository;
    this.getPracticeResult = requireFunction(
      getPracticeResult,
      "getPracticeResult"
    );
    this.getPracticeById = requireFunction(getPracticeById, "getPracticeById");
    this.getSyllabusById = requireFunction(
      getSyllabusById,
      "getSyllabusById"
    );
    this.calculatePreAssessmentLevel = requireFunction(
      calculatePreAssessmentLevel,
      "calculatePreAssessmentLevel"
    );
    this.preAssessmentPracticeType = requireIdentifier(
      preAssessmentPracticeType,
      "preAssessmentPracticeType"
    );
  }

  async execute({ studentId, practiceId } = {}) {
    const normalizedStudentId = requireIdentifier(studentId, "studentId");
    const normalizedPracticeId = requireIdentifier(practiceId, "practiceId");
    const practiceResult = await this.getPracticeResult({
      studentId: normalizedStudentId,
      practiceId: normalizedPracticeId
    });

    if (!practiceResult) {
      throw new Error(
        `Practice result ${normalizedPracticeId} was not found for student ${normalizedStudentId}.`
      );
    }

    const practice = await this.getPracticeById(normalizedPracticeId);

    if (!practice) {
      throw new Error(`Practice ${normalizedPracticeId} was not found.`);
    }

    if (practice.type !== this.preAssessmentPracticeType) {
      return createSkippedOutcome({
        studentId: normalizedStudentId,
        reason: "assessment-not-supported",
        practiceResult,
        practice
      });
    }

    const { syllabusId, topicId } = getPracticeScope(practice);
    const syllabus = await this.getSyllabusById(syllabusId);

    if (!syllabus) {
      throw new Error(`Syllabus ${syllabusId} was not found.`);
    }

    const topicExists = syllabus.topics.some((topic) => topic.id === topicId);

    if (!topicExists) {
      throw new Error(`Topic ${topicId} was not found in syllabus ${syllabusId}.`);
    }

    const assessmentFrameworkId = requireIdentifier(
      syllabus.assessmentFrameworkId,
      "syllabus.assessmentFrameworkId"
    );
    const levelCalculation = await this.calculatePreAssessmentLevel({
      assessmentFrameworkId,
      score: practiceResult.score
    });
    const progress = new StudentAssessmentTopicProgress({
      studentId: normalizedStudentId,
      syllabusId,
      topicId,
      initialLevel: {
        levelId: levelCalculation.levelId,
        setAt: practiceResult.submittedAt
      },
      currentLevelId: levelCalculation.levelId,
      isFrameworkCompleted: levelCalculation.isEndLevel,
      levelHistory: {
        [levelCalculation.levelId]: practiceResult.submittedAt
      }
    });
    const savedProgress =
      await this.studentAssessmentProgressRepository
        .savePreAssessmentProgress(progress);

    return Object.freeze({
      assessed: true,
      reason: null,
      studentId: normalizedStudentId,
      practiceId: normalizedPracticeId,
      practiceType: practice.type,
      score: practiceResult.score,
      syllabusId,
      topicId,
      assessmentFrameworkId,
      levelId: levelCalculation.levelId,
      levelName: levelCalculation.levelName,
      isFrameworkCompleted: levelCalculation.isEndLevel,
      progress: savedProgress
    });
  }
}
