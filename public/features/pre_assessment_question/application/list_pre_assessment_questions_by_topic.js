export class ListPreAssessmentQuestionsByTopic {
  constructor(preAssessmentQuestionRepository) {
    this.preAssessmentQuestionRepository = preAssessmentQuestionRepository;
  }

  async execute(syllabusId, topicId, options = {}) {
    return this.preAssessmentQuestionRepository.listByTopic(
      syllabusId,
      topicId,
      options
    );
  }
}
