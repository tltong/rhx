export class UnsubscribeSyllabus {
  constructor(syllabusSubscriptionRepository) {
    this.syllabusSubscriptionRepository = syllabusSubscriptionRepository;
  }

  async execute(studentId, syllabusId) {
    await this.syllabusSubscriptionRepository.delete(studentId, syllabusId);
  }
}
