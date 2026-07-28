const PATH_FIELDS = Object.freeze(["id", "syllabusId", "topicId"]);

class UpdateQuestion {
  constructor(questionRepository) {
    this.questionRepository = questionRepository;
  }

  async execute(syllabusId, topicId, questionId, changes) {
    const question = await this.questionRepository.getById(
      syllabusId,
      topicId,
      questionId,
    );

    if (!question) {
      throw new Error("Question could not be found.");
    }

    if (!changes || typeof changes !== "object" || Array.isArray(changes)) {
      throw new Error("changes must be an object.");
    }

    PATH_FIELDS.forEach((fieldName) => {
      if (
        changes[fieldName] !== undefined &&
        String(changes[fieldName]) !== String(question[fieldName])
      ) {
        throw new Error(`${fieldName} cannot be changed.`);
      }
    });

    question.update(changes);
    await this.questionRepository.save(question);

    return question;
  }
}

module.exports = {
  UpdateQuestion,
};
