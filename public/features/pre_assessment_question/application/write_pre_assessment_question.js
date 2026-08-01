import {
  PreAssessmentQuestion
} from "../domain/pre_assessment_question.js?v=20260730-pre-assessment-question";

export class WritePreAssessmentQuestion {
  constructor(preAssessmentQuestionRepository) {
    this.preAssessmentQuestionRepository = preAssessmentQuestionRepository;
  }

  async execute(questionInput) {
    const question = new PreAssessmentQuestion(questionInput);

    await this.preAssessmentQuestionRepository.save(question);

    return question;
  }
}
