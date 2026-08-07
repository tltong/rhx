const {
  normalizePreAssessmentQuestionOption,
} = require("../domain/pre_assessment_question");

function requireIdentifier(value, fieldName) {
  const identifier = String(value ?? "").trim();

  if (!identifier) {
    throw new Error(`${fieldName} is required.`);
  }

  return identifier;
}

function normalizeAnswer(answer, index) {
  if (!answer || typeof answer !== "object" || Array.isArray(answer)) {
    throw new Error(`answers[${index}] must be an object.`);
  }

  return {
    syllabusId: requireIdentifier(
      answer.syllabusId,
      `answers[${index}].syllabusId`,
    ),
    topicId: requireIdentifier(
      answer.topicId,
      `answers[${index}].topicId`,
    ),
    questionId: requireIdentifier(
      answer.questionId,
      `answers[${index}].questionId`,
    ),
    selectedOption: normalizePreAssessmentQuestionOption(
      answer.selectedOption,
      `answers[${index}].selectedOption`,
    ),
  };
}

function questionKey(answer) {
  return [
    answer.syllabusId,
    answer.topicId,
    answer.questionId,
  ].join("/");
}

class CheckPreAssessmentQuestionAnswers {
  constructor(preAssessmentQuestionRepository) {
    this.preAssessmentQuestionRepository = preAssessmentQuestionRepository;
  }

  async execute({answers} = {}) {
    if (!Array.isArray(answers) || answers.length === 0) {
      throw new Error("At least one answer is required.");
    }

    const normalizedAnswers = answers.map(normalizeAnswer);
    const answerKeys = new Set();

    normalizedAnswers.forEach((answer) => {
      const key = questionKey(answer);

      if (answerKeys.has(key)) {
        throw new Error(`Duplicate pre-assessment question answer: ${key}.`);
      }

      answerKeys.add(key);
    });

    const questions = await this.preAssessmentQuestionRepository.getManyById(
      normalizedAnswers,
    );

    if (!Array.isArray(questions) || questions.length !== answers.length) {
      throw new Error(
        "Pre-assessment question repository returned an invalid result.",
      );
    }

    const results = normalizedAnswers.map((answer, index) => {
      const question = questions[index];

      if (!question) {
        throw new Error(
          `Pre-assessment question ${questionKey(answer)} was not found.`,
        );
      }

      return {
        syllabusId: answer.syllabusId,
        topicId: answer.topicId,
        questionId: answer.questionId,
        selectedOption: answer.selectedOption,
        correctAnswer: question.correctAnswer,
        isCorrect: answer.selectedOption === question.correctAnswer,
      };
    });

    return {results};
  }
}

module.exports = {
  CheckPreAssessmentQuestionAnswers,
};
