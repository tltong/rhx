export class GetStudentSyllabusSubscription {
  constructor(syllabusSubscriptionRepository) {
    this.syllabusSubscriptionRepository = syllabusSubscriptionRepository;
  }

  async execute(studentId, syllabusId) {
    return this.syllabusSubscriptionRepository.get(studentId, syllabusId);
  }
}
