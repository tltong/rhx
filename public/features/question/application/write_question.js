import { Question } from "../domain/question.js";

export class WriteQuestion {
  constructor(questionRepository) {
    this.questionRepository = questionRepository;
  }

  async execute(questionInput) {
    const question = new Question(questionInput);

    await this.questionRepository.save(question);

    return question;
  }
}
