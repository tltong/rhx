import {
  StudentSubscription
} from "../domain/student_subscription.js?v=20260829-student-subscriptions-v1";

export class CreateStudentSubscription {
  constructor(studentSubscriptionRepository) {
    this.studentSubscriptionRepository = studentSubscriptionRepository;
  }

  async execute({ studentId, subscriptionType, activeUntil = null }) {
    const now = new Date();
    const subscription = new StudentSubscription({
      studentId,
      subscriptionType,
      activeUntil,
      createdAt: now,
      updatedAt: now
    });

    return this.studentSubscriptionRepository.createSubscription(
      subscription
    );
  }
}
