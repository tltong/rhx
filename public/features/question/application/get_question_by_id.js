import { normalizeQuestionId } from "../domain/question_id.js?v=20261015-question-by-id";

export class GetQuestionById {
  constructor(questionRepository) {
    this.questionRepository = questionRepository;
  }

  async execute(questionId) {
    return this.questionRepository.getByQuestionId(
      normalizeQuestionId(questionId),
    );
  }
}
