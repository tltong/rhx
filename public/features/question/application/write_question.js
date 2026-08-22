import {
  Question
} from "../domain/question.js?v=20260817-question-writes";

export class WriteQuestion {
  constructor(questionRepository) {
    this.questionRepository = questionRepository;
  }

  async execute(questionInput) {
    const question = new Question(questionInput);

    return this.questionRepository.save(question);
  }
}
