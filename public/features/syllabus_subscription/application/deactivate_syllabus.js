import { SyllabusSubscription } from "../domain/syllabus_subscription.js";

export class DeactivateSyllabus {
  constructor(syllabusSubscriptionRepository) {
    this.syllabusSubscriptionRepository = syllabusSubscriptionRepository;
  }

  async execute(studentId, syllabusId) {
    const now = new Date();
    const existingSubscription =
      await this.syllabusSubscriptionRepository.get(studentId, syllabusId);
    const syllabusSubscription = existingSubscription || new SyllabusSubscription({
      studentId,
      syllabusId,
      subscribedAt: now
    });

    syllabusSubscription.deactivate(now);

    await this.syllabusSubscriptionRepository.save(syllabusSubscription);

    return syllabusSubscription;
  }
}
