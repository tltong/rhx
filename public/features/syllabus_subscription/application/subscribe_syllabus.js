import {
  SyllabusSubscription
} from "../domain/syllabus_subscription.js?v=20260726-subscription-language";
import {
  resolveSyllabusLanguage
} from "./resolve_syllabus_language.js?v=20260726-subscription-language";

export class SubscribeSyllabus {
  constructor({
    syllabusSubscriptionRepository,
    getSyllabusById
  }) {
    this.syllabusSubscriptionRepository = syllabusSubscriptionRepository;
    this.getSyllabusById = getSyllabusById;
  }

  async execute(studentId, syllabusId, language) {
    const now = new Date();
    const selectedLanguage = await resolveSyllabusLanguage({
      getSyllabusById: this.getSyllabusById,
      syllabusId,
      language
    });
    const existingSubscription =
      await this.syllabusSubscriptionRepository.get(studentId, syllabusId);
    const syllabusSubscription = existingSubscription || new SyllabusSubscription({
      studentId,
      syllabusId,
      language: selectedLanguage,
      subscribedAt: now
    });

    syllabusSubscription.setLanguage(selectedLanguage);
    syllabusSubscription.activate(now);

    await this.syllabusSubscriptionRepository.save(syllabusSubscription);

    return syllabusSubscription;
  }
}
