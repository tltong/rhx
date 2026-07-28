import {
  AssessmentFramework
} from "../domain/assessment_framework.js?v=20260729-framework-wide-pre-assessment";

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
