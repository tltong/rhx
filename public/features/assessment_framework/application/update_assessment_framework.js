export class UpdateAssessmentFramework {
  constructor(assessmentFrameworkRepository) {
    this.assessmentFrameworkRepository = assessmentFrameworkRepository;
  }

  async execute(assessmentFramework, changes) {
    assessmentFramework.update(changes);

    await this.assessmentFrameworkRepository.save(assessmentFramework);

    return assessmentFramework;
  }
}
