const { normalizeQuestionId } = require("../domain/question_id");

class GetQuestionById {
  constructor(questionRepository) {
    this.questionRepository = questionRepository;
  }

  async execute(questionId) {
    return this.questionRepository.getByQuestionId(
      normalizeQuestionId(questionId),
    );
  }
}

module.exports = { GetQuestionById };
