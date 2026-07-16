export class ListStudentSyllabusSubscriptions {
  constructor(syllabusSubscriptionRepository) {
    this.syllabusSubscriptionRepository = syllabusSubscriptionRepository;
  }

  async execute(studentId) {
    return this.syllabusSubscriptionRepository.listByStudent(studentId);
  }
}
