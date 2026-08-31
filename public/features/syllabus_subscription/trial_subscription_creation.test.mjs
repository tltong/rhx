import assert from "node:assert/strict";
import test from "node:test";

import {
  CreateStudentSubscription
} from "./application/create_student_subscription.js?v=20260829-student-trial-subscription-v1";
import {
  subscriptionTypes
} from "./domain/student_subscription.js?v=20260829-student-trial-subscription-v1";

test("trial subscriptions may be created without an expiry", async () => {
  let savedSubscription = null;
  const repository = {
    async createSubscription(subscription) {
      savedSubscription = subscription;
      return subscription;
    }
  };
  const createStudentSubscription = new CreateStudentSubscription(repository);

  const result = await createStudentSubscription.execute({
    studentId: "student-1",
    subscriptionType: subscriptionTypes.TRIAL
  });

  assert.equal(result, savedSubscription);
  assert.equal(result.subscriptionType, subscriptionTypes.TRIAL);
  assert.equal(result.activeUntil, null);
  assert.ok(result.createdAt instanceof Date);
  assert.ok(result.updatedAt instanceof Date);
});
