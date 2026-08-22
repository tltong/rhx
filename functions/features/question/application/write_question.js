const { Question } = require("../domain/question");

class WriteQuestion {
  constructor(questionRepository) {
    this.questionRepository = questionRepository;
  }

  async execute(questionInput) {
    const question = new Question(questionInput);

    return this.questionRepository.save(question);
  }
}

module.exports = {
  WriteQuestion,
};
