import {
  Question
} from "../domain/question.js?v=20260817-question-writes";

export class WriteQuestions {
  constructor(questionRepository) {
    this.questionRepository = questionRepository;
  }

  async execute(questionInputs) {
    if (!Array.isArray(questionInputs) || questionInputs.length === 0) {
      throw new Error("At least one question is required.");
    }

    const questions = questionInputs.map(
      (questionInput) => new Question(questionInput)
    );

    return this.questionRepository.saveMany(questions);
  }
}
