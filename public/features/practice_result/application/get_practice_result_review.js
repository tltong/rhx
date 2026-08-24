import {
  PracticeResultReview
} from "../domain/practice_result_review.js?v=20260824-practice-review";

function requireFunction(value, fieldName) {
  if (typeof value !== "function") {
    throw new Error(`${fieldName} must be a function.`);
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

function requireQuestion(question, reference, index) {
  if (!question) {
    throw new Error(
      `Question ${reference.questionId || index + 1} was not found.`
    );
  }

  return question;
}

export class GetPracticeResultReview {
  constructor({
    practiceResultRepository,
    getPracticeById,
    questionLoaders
  } = {}) {
    this.practiceResultRepository = practiceResultRepository;
    this.getPracticeById = requireFunction(getPracticeById, "getPracticeById");
    this.questionLoaders = questionLoaders || {};
  }

  async execute({ practiceId, studentId } = {}) {
    const normalizedPracticeId = requireIdentifier(practiceId, "practiceId");
    const normalizedStudentId = requireIdentifier(studentId, "studentId");
    const result = await this.practiceResultRepository.getById(
      normalizedPracticeId,
      normalizedStudentId
    );

    if (!result) {
      return null;
    }

    const practice = await this.getPracticeById(normalizedPracticeId);

    if (!practice) {
      throw new Error(`Practice ${normalizedPracticeId} was not found.`);
    }

    const loadQuestions = requireFunction(
      this.questionLoaders[practice.type],
      `questionLoaders.${practice.type}`
    );
    const questions = await loadQuestions(practice.questions);

    if (!Array.isArray(questions) || questions.length !== practice.questions.length) {
      throw new Error("Practice review question count is inconsistent.");
    }

    const reviewedQuestions = questions.map((questionValue, index) => {
      const reference = practice.questions[index];
      const question = requireQuestion(questionValue, reference, index);
      const answer = result.answers[reference.questionId];

      if (!answer) {
        throw new Error(
          `Stored answer for question ${reference.questionId} was not found.`
        );
      }

      return {
        questionId: reference.questionId,
        questionText: question.questionText,
        options: question.options,
        selectedOption: answer.selectedOption,
        correctAnswer: answer.correctAnswer,
        isCorrect: answer.isCorrect,
        explanation: question.explanation,
        hasDiagram: question.hasDiagram,
        svg: question.svg
      };
    });

    return new PracticeResultReview({
      practiceId: result.practiceId,
      studentId: result.studentId,
      practiceType: practice.type,
      submittedAt: result.submittedAt,
      timeTakenSeconds: result.timeTakenSeconds,
      questionsCorrect: result.questionsCorrect,
      totalQuestions: result.totalQuestions,
      score: result.score,
      questions: reviewedQuestions
    });
  }
}
