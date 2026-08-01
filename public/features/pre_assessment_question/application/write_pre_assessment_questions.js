import {
  PreAssessmentQuestion
} from "../domain/pre_assessment_question.js?v=20260730-pre-assessment-question";

export class WritePreAssessmentQuestions {
  constructor(preAssessmentQuestionRepository) {
    this.preAssessmentQuestionRepository = preAssessmentQuestionRepository;
  }

  async execute(questionInputs) {
    if (!Array.isArray(questionInputs) || questionInputs.length === 0) {
      throw new Error("At least one question is required.");
    }

    const questions = questionInputs.map(
      (questionInput) => new PreAssessmentQuestion(questionInput)
    );

    await this.preAssessmentQuestionRepository.saveMany(questions);

    return questions;
  }
}
