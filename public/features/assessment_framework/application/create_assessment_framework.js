import {
  AssessmentFramework
} from "../domain/assessment_framework.js?v=20260730-score-bands";

export class CreateAssessmentFramework {
  constructor(assessmentFrameworkRepository) {
    this.assessmentFrameworkRepository = assessmentFrameworkRepository;
  }

  async execute(data) {
    const assessmentFramework = new AssessmentFramework(data);

    await this.assessmentFrameworkRepository.save(assessmentFramework);

    return assessmentFramework;
  }
}
