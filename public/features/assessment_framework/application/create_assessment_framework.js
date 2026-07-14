import { AssessmentFramework } from "../domain/assessment_framework.js";

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
