const {normalizePreAssessmentQuestionId} = require("../domain/pre_assessment_question_id");

class GetPreAssessmentQuestionById {
  constructor(repository) {
    this.repository = repository;
  }

  async execute(questionId) {
    return this.repository.getByQuestionId(normalizePreAssessmentQuestionId(questionId));
  }
}

module.exports = {GetPreAssessmentQuestionById};
