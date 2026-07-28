import {
  Question
} from "../domain/question.js?v=20260727-question-group";

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
