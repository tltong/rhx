const {
  StudentAssessmentTopicProgress,
} = require("../domain/student_assessment_topic_progress");
const {
  getPracticeScope,
  practiceMatchesScope,
  requireFunction,
  requireIdentifier,
  requireSyllabusTopic,
  toDate,
} = require("./assessment_helpers");

function normalizeDifficulty(value) {
  return requireIdentifier(value, "difficulty").toLocaleLowerCase();
}

function skippedOutcome({
  reason,
  studentId,
  practice,
  practiceResult,
  syllabusId,
  topicId,
  progress,
}) {
  return Object.freeze({
    assessed: false,
    reason,
    studentId,
    practiceId: practiceResult.practiceId,
    practiceType: practice.type,
    score: practiceResult.score,
    syllabusId,
    topicId,
    previousLevelId: progress?.currentLevelId || null,
    levelId: progress?.currentLevelId || null,
    levelName: null,
    levelChanged: false,
    isFrameworkCompleted: progress?.isFrameworkCompleted === true,
    progress: progress || null,
  });
}

class AssessNormalAssessmentPractice {
  constructor({
    studentAssessmentProgressRepository,
    getSyllabusById,
    getAssessmentLevelCriteria,
    calculateAssessmentProgression,
    listCompletedPracticeIds,
    getPracticeById,
    getPracticeResult,
    getQuestionDifficulty,
    assessmentPracticeType,
  } = {}) {
    if (!studentAssessmentProgressRepository) {
      throw new Error("studentAssessmentProgressRepository is required.");
    }

    this.studentAssessmentProgressRepository =
      studentAssessmentProgressRepository;
    this.getSyllabusById = requireFunction(
      getSyllabusById,
      "getSyllabusById",
    );
    this.getAssessmentLevelCriteria = requireFunction(
      getAssessmentLevelCriteria,
      "getAssessmentLevelCriteria",
    );
    this.calculateAssessmentProgression = requireFunction(
      calculateAssessmentProgression,
      "calculateAssessmentProgression",
    );
    this.listCompletedPracticeIds = requireFunction(
      listCompletedPracticeIds,
      "listCompletedPracticeIds",
    );
    this.getPracticeById = requireFunction(getPracticeById, "getPracticeById");
    this.getPracticeResult = requireFunction(
      getPracticeResult,
      "getPracticeResult",
    );
    this.getQuestionDifficulty = requireFunction(
      getQuestionDifficulty,
      "getQuestionDifficulty",
    );
    this.assessmentPracticeType = requireIdentifier(
      assessmentPracticeType,
      "assessmentPracticeType",
    );
  }

  async getCompletedPracticeScores({
    studentId,
    currentPractice,
    currentPracticeResult,
    syllabusId,
    topicId,
    levelEnteredAt,
    expectedDifficulty,
  }) {
    const completedPracticeIds = new Set(
      await this.listCompletedPracticeIds({studentId}),
    );
    completedPracticeIds.add(currentPracticeResult.practiceId);

    const completedPractices = await Promise.all(
      [...completedPracticeIds].map(async (practiceId) => {
        if (practiceId === currentPracticeResult.practiceId) {
          return {
            practice: currentPractice,
            practiceResult: currentPracticeResult,
          };
        }

        const [practice, practiceResult] = await Promise.all([
          this.getPracticeById(practiceId),
          this.getPracticeResult({studentId, practiceId}),
        ]);

        return {practice, practiceResult};
      }),
    );
    const scopedPractices = completedPractices.filter(
      ({practice, practiceResult}) => {
        if (!practiceResult || !practiceMatchesScope(
          practice,
          this.assessmentPracticeType,
          syllabusId,
          topicId,
        )) {
          return false;
        }

        return toDate(
          practiceResult.submittedAt,
          "practiceResult.submittedAt",
        ).getTime() > levelEnteredAt.getTime();
      },
    );
    const scoredPractices = await Promise.all(
      scopedPractices.map(async ({practice, practiceResult}) => ({
        difficulty: await this.getQuestionDifficulty(practice.questions[0]),
        score: practiceResult.score,
      })),
    );

    return scoredPractices
      .filter(({difficulty}) =>
        normalizeDifficulty(difficulty) === expectedDifficulty,
      )
      .map(({score}) => score);
  }

  async execute({studentId, practice, practiceResult} = {}) {
    const normalizedStudentId = requireIdentifier(studentId, "studentId");
    const {syllabusId, topicId} = getPracticeScope(practice);
    const syllabus = await requireSyllabusTopic(
      this.getSyllabusById,
      syllabusId,
      topicId,
    );
    const assessmentFrameworkId = requireIdentifier(
      syllabus.assessmentFrameworkId,
      "syllabus.assessmentFrameworkId",
    );
    const existingProgress =
      await this.studentAssessmentProgressRepository.getByTopic(
        normalizedStudentId,
        syllabusId,
        topicId,
      );

    if (existingProgress?.isFrameworkCompleted) {
      return skippedOutcome({
        reason: "framework-already-completed",
        studentId: normalizedStudentId,
        practice,
        practiceResult,
        syllabusId,
        topicId,
        progress: existingProgress,
      });
    }

    let currentLevelId;
    let levelCriteria;

    if (existingProgress) {
      currentLevelId = existingProgress.currentLevelId;
      levelCriteria = await this.getAssessmentLevelCriteria({
        assessmentFrameworkId,
        levelId: currentLevelId,
      });
    } else {
      const baseline = await this.calculateAssessmentProgression({
        assessmentFrameworkId,
        currentLevelId: null,
        scores: [],
      });
      currentLevelId = baseline.previousLevelId;
      levelCriteria = baseline;
    }

    const levelEnteredAt = existingProgress
      ? toDate(
        existingProgress.levelHistory[currentLevelId]
          || existingProgress.initialLevel.setAt,
        "current level entry date",
      )
      : new Date(0);
    const currentPracticeCompletedAt = toDate(
      practiceResult.submittedAt,
      "practiceResult.submittedAt",
    );

    const expectedDifficulty = normalizeDifficulty(
      levelCriteria.criteria.difficultyLevel,
    );
    const scores = await this.getCompletedPracticeScores({
      studentId: normalizedStudentId,
      currentPractice: practice,
      currentPracticeResult: practiceResult,
      syllabusId,
      topicId,
      levelEnteredAt,
      expectedDifficulty,
    });
    const progression = await this.calculateAssessmentProgression({
      assessmentFrameworkId,
      currentLevelId,
      scores,
    });
    const initialLevel = existingProgress?.initialLevel || {
      levelId: currentLevelId,
      setAt: currentPracticeCompletedAt,
    };
    const levelHistory = {
      ...(existingProgress?.levelHistory || {}),
    };

    if (!existingProgress) {
      levelHistory[currentLevelId] = currentPracticeCompletedAt;
    }

    if (progression.levelChanged) {
      levelHistory[progression.levelId] = currentPracticeCompletedAt;
    }

    const progress = new StudentAssessmentTopicProgress({
      studentId: normalizedStudentId,
      syllabusId,
      topicId,
      initialLevel,
      currentLevelId: progression.levelId,
      isFrameworkCompleted: progression.isEndLevel,
      levelHistory,
    });
    const savedProgress =
      await this.studentAssessmentProgressRepository.saveProgress(progress);

    return Object.freeze({
      assessed: true,
      reason: null,
      studentId: normalizedStudentId,
      practiceId: practiceResult.practiceId,
      practiceType: practice.type,
      score: practiceResult.score,
      syllabusId,
      topicId,
      assessmentFrameworkId,
      previousLevelId: progression.previousLevelId,
      levelId: progression.levelId,
      levelName: progression.levelName,
      levelChanged: progression.levelChanged,
      isFrameworkCompleted: progression.isEndLevel,
      eligiblePracticeCount: scores.length,
      qualifyingPracticeCount: progression.qualifyingPracticeCount,
      requiredPracticeCount: progression.criteria.requiredPracticeCount,
      minimumScore: progression.criteria.minimumScore,
      progress: savedProgress,
    });
  }
}

module.exports = {
  AssessNormalAssessmentPractice,
};
