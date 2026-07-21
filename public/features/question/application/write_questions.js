import { Question } from "../domain/question.js";

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

    await this.questionRepository.saveMany(questions);

    return questions;
  }
}
