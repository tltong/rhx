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

export class LoadPreAssessmentPractice {
  constructor({
    getTopicPreAssessmentPractice,
    getPracticeById,
    getPreAssessmentQuestion,
    preAssessmentPracticeType
  }) {
    this.getTopicPreAssessmentPractice = requireFunction(
      getTopicPreAssessmentPractice,
      "getTopicPreAssessmentPractice"
    );
    this.getPracticeById = requireFunction(
      getPracticeById,
      "getPracticeById"
    );
    this.getPreAssessmentQuestion = requireFunction(
      getPreAssessmentQuestion,
      "getPreAssessmentQuestion"
    );
    this.preAssessmentPracticeType = requireIdentifier(
      preAssessmentPracticeType,
      "preAssessmentPracticeType"
    );
  }

  async execute(input = {}) {
    const syllabusId = requireIdentifier(input.syllabusId, "syllabusId");
    const topicId = requireIdentifier(input.topicId, "topicId");
    const language = requireIdentifier(input.language, "language");
    const assignment = await this.getTopicPreAssessmentPractice(
      syllabusId,
      topicId,
      language
    );

    if (!assignment) {
      return null;
    }

    const practice = await this.getPracticeById(assignment.practiceId);

    if (!practice) {
      throw new Error(
        `Assigned pre-assessment practice ${assignment.practiceId} could not be found.`
      );
    }

    if (practice.type !== this.preAssessmentPracticeType) {
      throw new Error(
        "Assigned practice is not a pre-assessment practice."
      );
    }

    const questions = await Promise.all(
      practice.questions.map(async (questionReference) => {
        const question = await this.getPreAssessmentQuestion(
          questionReference.syllabusId,
          questionReference.topicId,
          questionReference.questionId
        );

        if (!question) {
          throw new Error(
            `Pre-assessment question ${questionReference.questionId} could not be found.`
          );
        }

        return question;
      })
    );

    return {
      assignment,
      practice,
      questions
    };
  }
}
