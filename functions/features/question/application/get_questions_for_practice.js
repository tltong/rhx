function requireQuestionReferences(questionReferences) {
  if (!Array.isArray(questionReferences) || questionReferences.length === 0) {
    throw new Error("At least one question reference is required.");
  }

  return questionReferences;
}

function toPracticeQuestion(question, questionReference, index) {
  if (!question) {
    throw new Error(
      `Question ${questionReference.questionId || index + 1} was not found.`,
    );
  }

  return Object.freeze({
    id: question.id,
    syllabusId: question.syllabusId,
    topicId: question.topicId,
    questionText: question.questionText,
    options: Object.freeze({...question.options}),
    hasDiagram: question.hasDiagram,
    svg: question.svg,
    difficulty: question.difficulty,
    language: question.language,
  });
}

class GetQuestionsForPractice {
  constructor(questionRepository) {
    this.questionRepository = questionRepository;
  }

  async execute(questionReferences) {
    const normalizedReferences = requireQuestionReferences(
      questionReferences,
    );
    const questions = await this.questionRepository.getManyById(
      normalizedReferences,
    );

    return questions.map((question, index) => toPracticeQuestion(
      question,
      normalizedReferences[index],
      index,
    ));
  }
}

module.exports = {
  GetQuestionsForPractice,
};
