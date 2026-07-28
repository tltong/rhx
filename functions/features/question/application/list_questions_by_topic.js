class ListQuestionsByTopic {
  constructor(questionRepository) {
    this.questionRepository = questionRepository;
  }

  async execute(syllabusId, topicId, options = {}) {
    return this.questionRepository.listByTopic(
      syllabusId,
      topicId,
      options,
    );
  }
}

module.exports = {
  ListQuestionsByTopic,
};
