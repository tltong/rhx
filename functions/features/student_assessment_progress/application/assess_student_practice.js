const {
  requireFunction,
  requireIdentifier,
} = require("./assessment_helpers");

function createSkippedOutcome({
  studentId,
  reason,
  practiceResult = null,
  practice = null,
}) {
  return Object.freeze({
    assessed: false,
    reason,
    studentId,
    practiceId: practiceResult?.practiceId || null,
    practiceType: practice?.type || null,
    score: practiceResult?.score ?? null,
    progress: null,
  });
}

class AssessStudentPractice {
  constructor({
    getPracticeResult,
    getPracticeById,
    assessPreAssessmentPractice,
    assessNormalAssessmentPractice,
    preAssessmentPracticeType,
    assessmentPracticeType,
  } = {}) {
    this.getPracticeResult = requireFunction(
      getPracticeResult,
      "getPracticeResult",
    );
    this.getPracticeById = requireFunction(getPracticeById, "getPracticeById");
    this.assessPreAssessmentPractice = requireFunction(
      assessPreAssessmentPractice,
      "assessPreAssessmentPractice",
    );
    this.assessNormalAssessmentPractice = requireFunction(
      assessNormalAssessmentPractice,
      "assessNormalAssessmentPractice",
    );
    this.preAssessmentPracticeType = requireIdentifier(
      preAssessmentPracticeType,
      "preAssessmentPracticeType",
    );
    this.assessmentPracticeType = requireIdentifier(
      assessmentPracticeType,
      "assessmentPracticeType",
    );
  }

  async execute({studentId, practiceId} = {}) {
    const normalizedStudentId = requireIdentifier(studentId, "studentId");
    const normalizedPracticeId = requireIdentifier(practiceId, "practiceId");
    const practiceResult = await this.getPracticeResult({
      studentId: normalizedStudentId,
      practiceId: normalizedPracticeId,
    });

    if (!practiceResult) {
      throw new Error(
        `Practice result ${normalizedPracticeId} was not found for student ${normalizedStudentId}.`,
      );
    }

    const practice = await this.getPracticeById(normalizedPracticeId);

    if (!practice) {
      throw new Error(`Practice ${normalizedPracticeId} was not found.`);
    }

    const input = {
      studentId: normalizedStudentId,
      practice,
      practiceResult,
    };

    if (practice.type === this.preAssessmentPracticeType) {
      return this.assessPreAssessmentPractice(input);
    }

    if (practice.type === this.assessmentPracticeType) {
      return this.assessNormalAssessmentPractice(input);
    }

    return createSkippedOutcome({
      studentId: normalizedStudentId,
      reason: "unsupported-practice-type",
      practiceResult,
      practice,
    });
  }
}

module.exports = {
  AssessStudentPractice,
};
