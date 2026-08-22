import {
  PreAssessmentQuestion
} from "../domain/pre_assessment_question.js?v=20260807-pre-assessment-answer-check";

export class WritePreAssessmentQuestion {
  constructor(preAssessmentQuestionRepository) {
    this.preAssessmentQuestionRepository = preAssessmentQuestionRepository;
  }

  async execute(questionInput) {
    const question = new PreAssessmentQuestion(questionInput);

    return this.preAssessmentQuestionRepository.save(question);
  }
}
