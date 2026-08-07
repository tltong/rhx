class ListPracticeResults {
  constructor(practiceResultRepository) {
    this.practiceResultRepository = practiceResultRepository;
  }

  async execute({practiceId} = {}) {
    return this.practiceResultRepository.listByPractice(practiceId);
  }
}

module.exports = {
  ListPracticeResults,
};
