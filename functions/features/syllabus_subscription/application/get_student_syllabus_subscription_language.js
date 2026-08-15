class GetStudentSyllabusSubscriptionLanguage {
  constructor(syllabusSubscriptionRepository) {
    if (!syllabusSubscriptionRepository) {
      throw new Error("syllabusSubscriptionRepository is required.");
    }

    this.syllabusSubscriptionRepository = syllabusSubscriptionRepository;
  }

  async execute(studentId, syllabusId) {
    const subscription = await this.syllabusSubscriptionRepository.get(
      studentId,
      syllabusId,
    );

    return subscription ? subscription.language : null;
  }
}

module.exports = {
  GetStudentSyllabusSubscriptionLanguage,
};
