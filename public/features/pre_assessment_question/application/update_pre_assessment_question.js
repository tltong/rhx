const PATH_FIELDS = Object.freeze(["id", "syllabusId", "topicId"]);

export class UpdatePreAssessmentQuestion {
  constructor(preAssessmentQuestionRepository) {
    this.preAssessmentQuestionRepository = preAssessmentQuestionRepository;
  }

  async execute(syllabusId, topicId, questionId, changes) {
    const question = await this.preAssessmentQuestionRepository.getById(
      syllabusId,
      topicId,
      questionId
    );

    if (!question) {
      throw new Error("Pre-assessment question could not be found.");
    }

    if (!changes || typeof changes !== "object" || Array.isArray(changes)) {
      throw new Error("changes must be an object.");
    }

    PATH_FIELDS.forEach((fieldName) => {
      if (
        changes[fieldName] !== undefined
        && String(changes[fieldName]) !== String(question[fieldName])
      ) {
        throw new Error(`${fieldName} cannot be changed.`);
      }
    });

    question.update(changes);
    await this.preAssessmentQuestionRepository.save(question);

    return question;
  }
}
