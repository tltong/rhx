const { Practice } = require("../domain/practice");

class CreatePractice {
  constructor(practiceRepository) {
    this.practiceRepository = practiceRepository;
  }

  async execute(practiceInput) {
    const practice = new Practice(practiceInput);

    await this.practiceRepository.create(practice);

    return practice;
  }
}

module.exports = {
  CreatePractice,
};
