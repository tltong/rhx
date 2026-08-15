function requireLanguage(value, studentId, syllabusId) {
  const language = String(value ?? "").trim();

  if (!language) {
    throw new Error(
      `Subscription ${studentId}/${syllabusId} does not specify a language.`
    );
  }

  return language;
}

export class GetStudentSyllabusSubscriptionLanguage {
  constructor(syllabusSubscriptionRepository) {
    this.syllabusSubscriptionRepository = syllabusSubscriptionRepository;
  }

  async execute(studentId, syllabusId) {
    const subscription = await this.syllabusSubscriptionRepository.get(
      studentId,
      syllabusId
    );

    if (!subscription) {
      return null;
    }

    return requireLanguage(subscription.language, studentId, syllabusId);
  }
}
