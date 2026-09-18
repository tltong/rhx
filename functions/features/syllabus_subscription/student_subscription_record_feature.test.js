const assert = require("node:assert/strict");
const test = require("node:test");

const {
  CreateStudentSubscription,
} = require("./application/create_student_subscription");
const {
  LinkStudentPaymentSubscription,
} = require("./application/link_student_payment_subscription");
const {
  UpdateStudentSubscription,
} = require("./application/update_student_subscription");
const {
  paymentModes,
  paymentProviders,
  StudentSubscription,
  subscriptionTypes,
} = require("./domain/student_subscription");
const {
  FirestoreStudentSubscriptionRepository,
} = require(
  "./infrastructure/firestore_student_subscription_repository",
);
const studentSubscriptionModule = require("./student_subscription_module");

class MemoryStudentSubscriptionRepository {
  constructor() {
    this.subscriptions = new Map();
  }

  async getSubscription(studentId) {
    return this.subscriptions.get(studentId) || null;
  }

  async createSubscription(subscription) {
    this.subscriptions.set(subscription.studentId, subscription);
    return subscription;
  }

  async saveSubscription(subscription) {
    this.subscriptions.set(subscription.studentId, subscription);
    return subscription;
  }
}

test("Functions student subscription module exposes matching record APIs", () => {
  [
    "createStudentSubscription",
    "getStudentSubscription",
    "linkStudentPaymentSubscription",
    "updateStudentSubscription",
  ].forEach((apiName) => {
    assert.equal(typeof studentSubscriptionModule[apiName], "function");
  });
  assert.deepEqual(studentSubscriptionModule.subscriptionTypes, {
    TRIAL: "trial",
    ONGOING: "ongoing",
  });
  assert.deepEqual(studentSubscriptionModule.paymentProviders, {
    STRIPE: "stripe",
  });
  assert.deepEqual(studentSubscriptionModule.paymentModes, {
    TEST: "test",
    PROD: "prod",
  });
});

test("Functions create and update APIs preserve subscription linkage", async () => {
  const repository = new MemoryStudentSubscriptionRepository();
  const createSubscription = new CreateStudentSubscription(repository);
  const updateSubscription = new UpdateStudentSubscription(repository);

  await createSubscription.execute({
    studentId: "student-1",
    subscriptionType: subscriptionTypes.ONGOING,
    activeUntil: null,
    paymentProvider: paymentProviders.STRIPE,
    paymentMode: paymentModes.TEST,
    paymentCustomerReference: "cus_customer_1",
    paymentSubscriptionReference: "sub_subscription_1",
    planId: "plan-1",
  });

  const activeUntil = new Date("2026-10-15T00:00:00.000Z");
  const updated = await updateSubscription.execute({
    studentId: "student-1",
    activeUntil,
  });

  assert.equal(updated.activeUntil, activeUntil);
  assert.equal(updated.paymentProvider, paymentProviders.STRIPE);
  assert.equal(updated.paymentMode, paymentModes.TEST);
  assert.equal(
    updated.paymentSubscriptionReference,
    "sub_subscription_1",
  );
});

test("Functions payment-link API derives provider and mode at runtime", async () => {
  const repository = new MemoryStudentSubscriptionRepository();

  repository.subscriptions.set("student-1", new StudentSubscription({
    studentId: "student-1",
    subscriptionType: subscriptionTypes.TRIAL,
  }));

  let configReads = 0;
  const linkSubscription = new LinkStudentPaymentSubscription({
    async getPaymentConfig() {
      configReads += 1;
      return {
        provider: paymentProviders.STRIPE,
        mode: paymentModes.PROD,
      };
    },
    studentSubscriptionRepository: repository,
  });
  const result = await linkSubscription.execute({
    studentId: "student-1",
    paymentCustomerReference: "cus_customer_1",
    paymentSubscriptionReference: "sub_subscription_1",
    planId: "plan-1",
  });

  assert.equal(configReads, 1);
  assert.equal(result.subscriptionType, subscriptionTypes.ONGOING);
  assert.equal(result.paymentProvider, paymentProviders.STRIPE);
  assert.equal(result.paymentMode, paymentModes.PROD);
  assert.equal(result.activeUntil, null);
});

test("Functions repository persists the complete subscription record", async () => {
  const calls = [];
  const repository = new FirestoreStudentSubscriptionRepository({
    async createDocumentIfAbsent() {},
    async readDocument() {
      return null;
    },
    async writeDocument(...args) {
      calls.push(args);
    },
  });
  const subscription = new StudentSubscription({
    studentId: "student-1",
    subscriptionType: subscriptionTypes.ONGOING,
    activeUntil: new Date("2026-10-15T00:00:00.000Z"),
    paymentProvider: paymentProviders.STRIPE,
    paymentMode: paymentModes.TEST,
    paymentCustomerReference: "cus_customer_1",
    paymentSubscriptionReference: "sub_subscription_1",
    planId: "plan-1",
    createdAt: new Date("2026-09-15T00:00:00.000Z"),
    updatedAt: new Date("2026-09-15T00:00:00.000Z"),
  });

  await repository.saveSubscription(subscription);

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "subscriptions");
  assert.equal(calls[0][1], "student-1");
  assert.deepEqual(calls[0][2], {
    subscriptionType: "ongoing",
    activeUntil: subscription.activeUntil,
    paymentProvider: "stripe",
    paymentMode: "test",
    paymentCustomerReference: "cus_customer_1",
    paymentSubscriptionReference: "sub_subscription_1",
    planId: "plan-1",
    createdAt: subscription.createdAt,
    updatedAt: subscription.updatedAt,
  });
  assert.deepEqual(calls[0][3], {merge: false});
});

test("Functions student subscription domain rejects partial linkage", () => {
  assert.throws(
    () => new StudentSubscription({
      studentId: "student-1",
      subscriptionType: subscriptionTypes.ONGOING,
      paymentProvider: paymentProviders.STRIPE,
    }),
    /Payment linkage must provide all of/,
  );
});
