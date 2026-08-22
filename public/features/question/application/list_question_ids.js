import {
  normalizeQuestionGroupRoute
} from "../domain/question.js?v=20260817-question-writes";

function normalizeQuestionIds(questionIds) {
  if (!Array.isArray(questionIds)) {
    throw new Error("Question repository returned an invalid ID list.");
  }

  return questionIds.map((questionId, index) => {
    const normalizedQuestionId = String(questionId ?? "").trim();

    if (!normalizedQuestionId) {
      throw new Error(
        `Question repository returned an invalid ID at index ${index}.`
      );
    }

    return normalizedQuestionId;
  });
}

export class ListQuestionIds {
  constructor(questionRepository) {
    this.questionRepository = questionRepository;
  }

  async execute(input) {
    const questionGroup = normalizeQuestionGroupRoute(input, "input");
    const questionIds = await this.questionRepository.listIdsByGroup(
      questionGroup
    );

    return normalizeQuestionIds(questionIds);
  }
}
