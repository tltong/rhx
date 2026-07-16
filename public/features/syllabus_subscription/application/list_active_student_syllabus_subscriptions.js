export class ListActiveStudentSyllabusSubscriptions {
  constructor(syllabusSubscriptionRepository) {
    this.syllabusSubscriptionRepository = syllabusSubscriptionRepository;
  }

  async execute(studentId) {
    return this.syllabusSubscriptionRepository.listActiveByStudent(studentId);
  }
}
