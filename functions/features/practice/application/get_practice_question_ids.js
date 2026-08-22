function requireIdentifier(value, fieldName) {
  const identifier = String(value ?? "").trim();

  if (!identifier) {
    throw new Error(`${fieldName} is required.`);
  }

  return identifier;
}

class GetPracticeQuestionIds {
  constructor(practiceRepository) {
    this.practiceRepository = practiceRepository;
  }

  async execute(practiceId) {
    const normalizedPracticeId = requireIdentifier(
      practiceId,
      "practiceId",
    );
    const practice = await this.practiceRepository.getById(
      normalizedPracticeId,
    );

    if (!practice) {
      throw new Error(`Practice ${normalizedPracticeId} was not found.`);
    }

    return practice.questions.map((question) => question.questionId);
  }
}

module.exports = {
  GetPracticeQuestionIds,
};
