export class UnsubscribeSyllabus {
  constructor(syllabusSubscriptionRepository) {
    this.syllabusSubscriptionRepository = syllabusSubscriptionRepository;
  }

  async execute(studentId, syllabusId) {
    return this.syllabusSubscriptionRepository.delete(studentId, syllabusId);
  }
}
