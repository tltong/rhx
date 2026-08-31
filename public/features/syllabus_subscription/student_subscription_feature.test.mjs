import assert from "node:assert/strict";
import test from "node:test";

import {
  CreateStudentSubscription
} from "./application/create_student_subscription.js";
import {
  RecordSubscriptionPayment
} from "./application/record_subscription_payment.js";
import {
  UpdateStudentSubscription
} from "./application/update_student_subscription.js";
import {
  subscriptionTypes
} from "./domain/student_subscription.js";
import * as studentSubscriptionModule from "./student_subscription_module.js";

class MemoryStudentSubscriptionRepository {
  constructor() {
    this.subscriptions = new Map();
    this.payments = [];
  }

  async getSubscription(studentId) {
    return this.subscriptions.get(studentId) || null;
  }

  async createSubscription(subscription) {
    if (this.subscriptions.has(subscription.studentId)) {
      throw new Error("already exists");
    }

    this.subscriptions.set(subscription.studentId, subscription);
    return subscription;
  }

  async saveSubscription(subscription) {
    this.subscriptions.set(subscription.studentId, subscription);
    return subscription;
  }

  async createPayment(payment) {
    payment.id = `payment_${this.payments.length + 1}`;
    this.payments.push(payment);
    return payment;
  }
}

function createRecordPayment(repository, overrides = {}) {
  return new RecordSubscriptionPayment({
    studentSubscriptionRepository: repository,
    getGuardianStudentLink: async () => ({ state: "active" }),
    guardianStudentLinkStates: { ACTIVE: "active" },
    getStudentById: async () => ({
      id: "student_1",
      country: "Malaysia"
    }),
    getSubscriptionPlan: async () => ({
      id: "plan_1",
      months: 3
    }),
    getSubscriptionPlanCatalog: async () => ({
      country: "Malaysia",
      currency: "MYR"
    }),
    ...overrides
  });
}

function paymentInput(overrides = {}) {
  return {
    studentId: "student_1",
    guardianId: "guardian_1",
    planId: "plan_1",
    durationMonths: 3,
    amountPaid: 59.9,
    currency: "MYR",
    paymentDate: new Date("2026-08-29T10:00:00Z"),
    paymentProvider: "test-provider",
    paymentProviderReference: "payment-reference-1",
    ...overrides
  };
}

test("student subscription module exposes the complete public API", () => {
  [
    "getStudentSubscription",
    "createStudentSubscription",
    "updateStudentSubscription",
    "getSubscriptionPayment",
    "listSubscriptionPayments",
    "recordSubscriptionPayment"
  ].forEach((apiName) => {
    assert.equal(typeof studentSubscriptionModule[apiName], "function");
  });
  assert.deepEqual(studentSubscriptionModule.subscriptionTypes, {
    TRIAL: "trial",
    ONGOING: "ongoing"
  });
});

test("create and update subscription manage lifecycle timestamps", async () => {
  const repository = new MemoryStudentSubscriptionRepository();
  const createSubscription = new CreateStudentSubscription(repository);
  const updateSubscription = new UpdateStudentSubscription(repository);
  const activeUntil = new Date("2026-09-29T00:00:00Z");
  const created = await createSubscription.execute({
    studentId: "student_1",
    subscriptionType: subscriptionTypes.TRIAL,
    activeUntil
  });
  const createdAt = created.createdAt;
  const updated = await updateSubscription.execute({
    studentId: "student_1",
    subscriptionType: subscriptionTypes.ONGOING,
    activeUntil: new Date("2026-12-29T00:00:00Z")
  });

  assert.equal(createdAt instanceof Date, true);
  assert.equal(updated.createdAt, createdAt);
  assert.equal(updated.updatedAt instanceof Date, true);
  assert.equal(updated.subscriptionType, "ongoing");
});

test("record payment validates guardian link, plan duration, and currency", async () => {
  const repository = new MemoryStudentSubscriptionRepository();
  const createSubscription = new CreateStudentSubscription(repository);

  await createSubscription.execute({
    studentId: "student_1",
    subscriptionType: subscriptionTypes.ONGOING,
    activeUntil: new Date("2026-12-29T00:00:00Z")
  });

  const recordPayment = createRecordPayment(repository);
  const payment = await recordPayment.execute(paymentInput());

  assert.equal(payment.id, "payment_1");
  assert.equal(payment.guardianId, "guardian_1");
  assert.equal(payment.createdAt instanceof Date, true);

  await assert.rejects(
    recordPayment.execute(paymentInput({ durationMonths: 6 })),
    /durationMonths must match/
  );
  await assert.rejects(
    recordPayment.execute(paymentInput({ currency: "SGD" })),
    /currency must match/
  );
});

test("record payment rejects a guardian without an active link", async () => {
  const repository = new MemoryStudentSubscriptionRepository();
  const createSubscription = new CreateStudentSubscription(repository);

  await createSubscription.execute({
    studentId: "student_1",
    subscriptionType: subscriptionTypes.ONGOING,
    activeUntil: new Date("2026-12-29T00:00:00Z")
  });

  const recordPayment = createRecordPayment(repository, {
    getGuardianStudentLink: async () => ({ state: "inactive" })
  });

  await assert.rejects(
    recordPayment.execute(paymentInput()),
    /not actively linked/
  );
  assert.equal(repository.payments.length, 0);
});
