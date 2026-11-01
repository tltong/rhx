import {
  StudentSubscription
} from "../domain/student_subscription.js?v=20261031-subscription-cancel-v1";

export class CreateStudentSubscription {
  constructor(studentSubscriptionRepository) {
    this.studentSubscriptionRepository = studentSubscriptionRepository;
  }

  async execute({
    studentId,
    subscriptionType,
    activeUntil = null,
    paymentProvider = null,
    paymentMode = null,
    paymentCustomerReference = null,
    paymentSubscriptionReference = null,
    planId = null
  }) {
    const now = new Date();
    const subscription = new StudentSubscription({
      studentId,
      subscriptionType,
      activeUntil,
      paymentProvider,
      paymentMode,
      paymentCustomerReference,
      paymentSubscriptionReference,
      planId,
      createdAt: now,
      updatedAt: now
    });

    return this.studentSubscriptionRepository.createSubscription(
      subscription
    );
  }
}
