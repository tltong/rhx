import {
  AssessmentFramework
} from "../domain/assessment_framework.js?v=20261018-topic-framework-v1";

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
