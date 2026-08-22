const {
  normalizeQuestionReference,
} = require("../domain/question");

class DeleteQuestion {
  constructor(questionRepository) {
    this.questionRepository = questionRepository;
  }

  async execute(questionReference) {
    return this.questionRepository.delete(
      normalizeQuestionReference(questionReference),
    );
  }
}

module.exports = {
  DeleteQuestion,
};
