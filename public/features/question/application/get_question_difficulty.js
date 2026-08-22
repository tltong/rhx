export class GetQuestionDifficulty {
  constructor(questionRepository) {
    if (!questionRepository) {
      throw new Error("questionRepository is required.");
    }

    this.questionRepository = questionRepository;
  }

  async execute(questionReference) {
    const question = await this.questionRepository.getById(questionReference);

    if (!question) {
      const questionId = String(questionReference?.questionId || "").trim();
      throw new Error(
        questionId
          ? `Question ${questionId} was not found.`
          : "Question was not found."
      );
    }

    return question.difficulty;
  }
}
