export class GetQuestion {
  constructor(questionRepository) {
    this.questionRepository = questionRepository;
  }

  async execute(syllabusId, topicId, questionId) {
    return this.questionRepository.getById(
      syllabusId,
      topicId,
      questionId
    );
  }
}
