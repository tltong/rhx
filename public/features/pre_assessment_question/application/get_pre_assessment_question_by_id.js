import {normalizePreAssessmentQuestionId} from "../domain/pre_assessment_question_id.js?v=20261015-practice-result-review-v1";

class GetPreAssessmentQuestionById {
  constructor(repository) {
    this.repository = repository;
  }

  async execute(questionId) {
    return this.repository.getByQuestionId(normalizePreAssessmentQuestionId(questionId));
  }
}

export {GetPreAssessmentQuestionById};
