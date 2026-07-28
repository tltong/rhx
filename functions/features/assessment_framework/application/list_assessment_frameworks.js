class ListAssessmentFrameworks {
  constructor(assessmentFrameworkRepository) {
    this.assessmentFrameworkRepository = assessmentFrameworkRepository;
  }

  async execute() {
    return this.assessmentFrameworkRepository.list();
  }
}

module.exports = {
  ListAssessmentFrameworks,
};
