class GetQuestion {
  constructor(questionRepository) {
    this.questionRepository = questionRepository;
  }

  async execute(questionReference) {
    return this.questionRepository.getById(questionReference);
  }
}

module.exports = {
  GetQuestion,
};
