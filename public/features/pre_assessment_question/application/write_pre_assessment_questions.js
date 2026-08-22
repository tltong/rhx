import {
  PreAssessmentQuestion
} from "../domain/pre_assessment_question.js?v=20260807-pre-assessment-answer-check";

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

    return this.preAssessmentQuestionRepository.saveMany(questions);
  }
}
