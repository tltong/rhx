export class GetPracticeResult {
  constructor(practiceResultRepository) {
    this.practiceResultRepository = practiceResultRepository;
  }

  async execute({ practiceId, studentId } = {}) {
    return this.practiceResultRepository.getById(practiceId, studentId);
  }
}
