const {
  PracticeResult,
  calculatePracticeScore,
} = require("../domain/practice_result");

function requireFunction(value, name) {
  if (typeof value !== "function") {
    throw new Error(`${name} must be a function.`);
  }

  return value;
}

function normalizeAnswerCheckers(answerCheckers) {
  if (
    !answerCheckers ||
    typeof answerCheckers !== "object" ||
    Array.isArray(answerCheckers)
  ) {
    throw new Error("answerCheckers must be an object.");
  }

  const entries = Object.entries(answerCheckers);

  if (entries.length === 0) {
    throw new Error("At least one answer checker is required.");
  }

  return Object.fromEntries(entries.map(([practiceType, checker]) => [
    practiceType,
    requireFunction(checker, `answerCheckers.${practiceType}`),
  ]));
}

function requireIdentifier(value, fieldName) {
  const identifier = String(value ?? "").trim();

  if (!identifier) {
    throw new Error(`${fieldName} is required.`);
  }

  return identifier;
}

function normalizeTimeTakenSeconds(value) {
  const seconds = Number(value);

  if (!Number.isInteger(seconds) || seconds < 0) {
    throw new Error("timeTakenSeconds must be a non-negative integer.");
  }

  return seconds;
}

function normalizeSubmittedAnswers(answers) {
  if (!Array.isArray(answers) || answers.length === 0) {
    throw new Error("At least one answer is required.");
  }

  const answerIds = new Set();

  return answers.map((answer, index) => {
    if (!answer || typeof answer !== "object" || Array.isArray(answer)) {
      throw new Error(`answers[${index}] must be an object.`);
    }

    const questionId = requireIdentifier(
      answer.questionId,
      `answers[${index}].questionId`,
    );
    const selectedOption = requireIdentifier(
      answer.selectedOption,
      `answers[${index}].selectedOption`,
    ).toLowerCase();

    if (answerIds.has(questionId)) {
      throw new Error(`Duplicate question answer: ${questionId}.`);
    }

    answerIds.add(questionId);

    return {questionId, selectedOption};
  });
}

class SubmitPracticeResult {
  constructor({
    practiceResultRepository,
    getPracticeById,
    answerCheckers,
    now = () => new Date(),
  } = {}) {
    if (!practiceResultRepository) {
      throw new Error("practiceResultRepository is required.");
    }

    this.practiceResultRepository = practiceResultRepository;
    this.getPracticeById = requireFunction(
      getPracticeById,
      "getPracticeById",
    );
    this.answerCheckers = normalizeAnswerCheckers(answerCheckers);
    this.now = requireFunction(now, "now");
  }

  async execute({
    practiceId,
    studentId,
    timeTakenSeconds,
    answers,
  } = {}) {
    const normalizedPracticeId = requireIdentifier(
      practiceId,
      "practiceId",
    );
    const normalizedStudentId = requireIdentifier(studentId, "studentId");
    const normalizedTimeTakenSeconds = normalizeTimeTakenSeconds(
      timeTakenSeconds,
    );
    const submittedAnswers = normalizeSubmittedAnswers(answers);
    const practice = await this.getPracticeById(normalizedPracticeId);

    if (!practice) {
      throw new Error(`Practice ${normalizedPracticeId} was not found.`);
    }

    const checkQuestionAnswers = this.answerCheckers[practice.type];

    if (!checkQuestionAnswers) {
      throw new Error(
        `No answer checker is configured for practice type: ${practice.type}.`,
      );
    }

    const practiceQuestionsById = new Map();

    practice.questions.forEach((question) => {
      if (practiceQuestionsById.has(question.questionId)) {
        throw new Error(
          `Practice contains duplicate question ID: ${question.questionId}.`,
        );
      }

      practiceQuestionsById.set(question.questionId, question);
    });

    if (submittedAnswers.length !== practice.questions.length) {
      throw new Error("An answer is required for every practice question.");
    }

    const submittedAnswersById = new Map(
      submittedAnswers.map((answer) => [answer.questionId, answer]),
    );

    submittedAnswers.forEach((answer) => {
      if (!practiceQuestionsById.has(answer.questionId)) {
        throw new Error(
          `Question ${answer.questionId} does not belong to the practice.`,
        );
      }
    });

    const answerCheckInput = practice.questions.map((question) => ({
      syllabusId: question.syllabusId,
      topicId: question.topicId,
      questionId: question.questionId,
      selectedOption: submittedAnswersById.get(question.questionId)
        .selectedOption,
    }));
    const checkedAnswers = await checkQuestionAnswers({
      answers: answerCheckInput,
    });

    if (
      !checkedAnswers ||
      !Array.isArray(checkedAnswers.results) ||
      checkedAnswers.results.length !== practice.questions.length
    ) {
      throw new Error("Question checker returned an invalid result.");
    }

    const evaluatedAnswers = Object.fromEntries(
      checkedAnswers.results.map((answer, index) => {
        const practiceQuestion = practice.questions[index];

        if (
          answer.questionId !== practiceQuestion.questionId ||
          answer.syllabusId !== practiceQuestion.syllabusId ||
          answer.topicId !== practiceQuestion.topicId
        ) {
          throw new Error("Question checker returned answers out of order.");
        }

        return [answer.questionId, {
          selectedOption: answer.selectedOption,
          correctAnswer: answer.correctAnswer,
          isCorrect: answer.isCorrect,
        }];
      }),
    );
    const questionsCorrect = Object.values(evaluatedAnswers)
      .filter((answer) => answer.isCorrect).length;
    const totalQuestions = practice.questions.length;
    const practiceResult = new PracticeResult({
      practiceId: normalizedPracticeId,
      studentId: normalizedStudentId,
      submittedAt: this.now(),
      timeTakenSeconds: normalizedTimeTakenSeconds,
      questionsCorrect,
      totalQuestions,
      score: calculatePracticeScore(questionsCorrect, totalQuestions),
      answers: evaluatedAnswers,
    });

    return this.practiceResultRepository.create(practiceResult);
  }
}

module.exports = {
  SubmitPracticeResult,
};
