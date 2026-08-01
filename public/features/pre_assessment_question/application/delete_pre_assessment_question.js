export class DeletePreAssessmentQuestion {
  constructor(preAssessmentQuestionRepository) {
    this.preAssessmentQuestionRepository = preAssessmentQuestionRepository;
  }

  async execute(syllabusId, topicId, questionId) {
    return this.preAssessmentQuestionRepository.delete(
      syllabusId,
      topicId,
      questionId
    );
  }
}
