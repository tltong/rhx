export class GetAssessmentFramework {
  constructor(assessmentFrameworkRepository) {
    this.assessmentFrameworkRepository = assessmentFrameworkRepository;
  }

  async execute(assessmentFrameworkId) {
    return this.assessmentFrameworkRepository.getById(assessmentFrameworkId);
  }
}
