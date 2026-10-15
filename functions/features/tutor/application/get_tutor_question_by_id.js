class GetTutorQuestionById {
  constructor({getQuestionById, getPreAssessmentQuestionById}) {
    Object.assign(this, {getQuestionById, getPreAssessmentQuestionById});
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
    return question || preAssessmentQuestion;
  }
}

module.exports = {GetTutorQuestionById};
