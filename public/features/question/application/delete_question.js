import {
  normalizeQuestionReference
} from "../domain/question.js?v=20260817-question-writes";

export class DeleteQuestion {
  constructor(questionRepository) {
    this.questionRepository = questionRepository;
  }

  async execute(questionReference) {
    return this.questionRepository.delete(
      normalizeQuestionReference(questionReference)
    );
  }
}
