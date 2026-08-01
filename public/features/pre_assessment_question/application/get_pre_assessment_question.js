export class GetPreAssessmentQuestion {
  constructor(preAssessmentQuestionRepository) {
    this.preAssessmentQuestionRepository = preAssessmentQuestionRepository;
  }

  async execute(syllabusId, topicId, questionId) {
    return this.preAssessmentQuestionRepository.getById(
      syllabusId,
      topicId,
      questionId
    );
  }
}
