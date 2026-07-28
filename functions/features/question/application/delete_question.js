class DeleteQuestion {
  constructor(questionRepository) {
    this.questionRepository = questionRepository;
  }

  async execute(syllabusId, topicId, questionId) {
    await this.questionRepository.delete(
      syllabusId,
      topicId,
      questionId,
    );
  }
}

module.exports = {
  DeleteQuestion,
};
