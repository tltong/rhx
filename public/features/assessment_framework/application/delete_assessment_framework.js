export class DeleteAssessmentFramework {
  constructor(assessmentFrameworkRepository) {
    this.assessmentFrameworkRepository = assessmentFrameworkRepository;
  }

  async execute(assessmentFrameworkId) {
    await this.assessmentFrameworkRepository.delete(assessmentFrameworkId);
  }
}
