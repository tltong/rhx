const {
  normalizeQuestionGroupRoute,
} = require("../domain/question");

class GetQuestionCount {
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

module.exports = {
  GetQuestionCount,
};
