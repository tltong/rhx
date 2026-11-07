class GetTutorQuestionById {
  constructor({getQuestionById, getPreAssessmentQuestionById, isTopicTutorEnabled}) {
    if (typeof isTopicTutorEnabled !== "function") throw new Error("isTopicTutorEnabled must be a function.");
    Object.assign(this, {getQuestionById, getPreAssessmentQuestionById, isTopicTutorEnabled});
  }

  async execute(questionId) {
    const [question, preAssessmentQuestion] = await Promise.all([
      this.getQuestionById(questionId),
      this.getPreAssessmentQuestionById(questionId),
    ]);
    if (question && preAssessmentQuestion) {
      const error = new Error("Question ID " + questionId + " exists in both question collections.");
      error.code = "ambiguous-question-id";
      throw error;
    }
    const source = question || preAssessmentQuestion;
    if (source && await this.isTopicTutorEnabled(source.syllabusId, source.topicId) !== true) {
      const error = new Error("Tutor is disabled for this topic.");
      error.code = "tutor-disabled";
      throw error;
    }
    return source;
  }
}

export {GetTutorQuestionById};
