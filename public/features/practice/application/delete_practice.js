export class DeletePractice {
  constructor(practiceRepository) {
    this.practiceRepository = practiceRepository;
  }

  async execute(practiceId) {
    return this.practiceRepository.delete(practiceId);
  }
}
