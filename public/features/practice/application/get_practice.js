export class GetPractice {
  constructor(practiceRepository) {
    this.practiceRepository = practiceRepository;
  }

  async execute(practiceId) {
    return this.practiceRepository.getById(practiceId);
  }
}
