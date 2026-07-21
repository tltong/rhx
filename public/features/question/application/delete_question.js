export class DeleteQuestion {
  constructor(questionRepository) {
    this.questionRepository = questionRepository;
  }

  async execute(syllabusId, topicId, questionId) {
    return this.questionRepository.delete(
      syllabusId,
      topicId,
      questionId
    );
  }
}
