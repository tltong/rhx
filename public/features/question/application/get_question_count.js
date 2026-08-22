import {
  normalizeQuestionGroupRoute
} from "../domain/question.js?v=20260817-question-writes";

export class GetQuestionCount {
  constructor(questionRepository) {
    this.questionRepository = questionRepository;
  }

  async execute(input) {
    const questionGroup = normalizeQuestionGroupRoute(input, "input");
    const count = await this.questionRepository.countByGroup(questionGroup);

    if (!Number.isInteger(count) || count < 0) {
      throw new Error("Question repository returned an invalid count.");
    }

    return count;
  }
}
