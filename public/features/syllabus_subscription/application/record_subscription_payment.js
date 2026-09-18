import {
  SubscriptionPayment
} from "../domain/student_subscription.js?v=20260915-student-payment-link-v1";

function normalizeComparisonText(value) {
  return String(value ?? "").trim().toLocaleLowerCase();
}

export class RecordSubscriptionPayment {
  constructor({
    studentSubscriptionRepository,
    getGuardianStudentLink,
    guardianStudentLinkStates,
    getStudentById,
    getSubscriptionPlan,
    getSubscriptionPlanCatalog
  }) {
    this.studentSubscriptionRepository = studentSubscriptionRepository;
    this.getGuardianStudentLink = getGuardianStudentLink;
    this.guardianStudentLinkStates = guardianStudentLinkStates;
    this.getStudentById = getStudentById;
    this.getSubscriptionPlan = getSubscriptionPlan;
    this.getSubscriptionPlanCatalog = getSubscriptionPlanCatalog;
  }

  async execute(input) {
    const [subscription, guardianLink, student] = await Promise.all([
      this.studentSubscriptionRepository.getSubscription(input.studentId),
      this.getGuardianStudentLink({
        guardianId: input.guardianId,
        studentId: input.studentId
      }),
      this.getStudentById(input.studentId)
    ]);

    if (!subscription) {
      throw new Error(
        `Subscription for student ${input.studentId} was not found.`
      );
    }

    if (
      !guardianLink
      || guardianLink.state !== this.guardianStudentLinkStates.ACTIVE
    ) {
      throw new Error(
        "The guardian is not actively linked to the selected student."
      );
    }

    if (!student) {
      throw new Error(`Student ${input.studentId} was not found.`);
    }

    const [plan, catalog] = await Promise.all([
      this.getSubscriptionPlan(student.country, input.planId),
      this.getSubscriptionPlanCatalog(student.country)
    ]);

    if (!plan || !catalog) {
      throw new Error("The selected subscription plan was not found.");
    }

    if (Number(input.durationMonths) !== plan.months) {
      throw new Error(
        "durationMonths must match the selected subscription plan."
      );
    }

    if (
      normalizeComparisonText(input.currency)
      !== normalizeComparisonText(catalog.currency)
    ) {
      throw new Error(
        "currency must match the selected country's subscription currency."
      );
    }

    const payment = new SubscriptionPayment({
      ...input,
      createdAt: new Date()
    });

    return this.studentSubscriptionRepository.createPayment(payment);
  }
}
