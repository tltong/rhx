import assert from "node:assert/strict";
import {test} from "node:test";
import {createRequire} from "node:module";
import {FirestoreStudentSubscriptionRepository} from "./infrastructure/firestore_student_subscription_repository.js";
import {subscriptionSchema} from "../../config/firebase/subscription_schema.js";

test("browser receipt reads isolate modes, preserve legacy receipts and retain server billing summaries on save", async () => {
  const now = new Date("2026-10-01Z");
  const parent = {subscriptionType: "ongoing", activeUntil: new Date("2026-11-01Z"), paymentProvider: "stripe",
    paymentMode: "prod", paymentCustomerReference: "cus_one", paymentSubscriptionReference: "sub_one", planId: "monthly",
    createdAt: now, updatedAt: now, applicationStatus: "suspended", billingSummary: {paymentState: "paid"}};
  const base = {guardianId: "guardian", planId: "monthly", durationMonths: 1, amountPaid: 25, currency: "myr",
    paymentDate: now, paymentProvider: "stripe", paymentProviderReference: "in_one", createdAt: now};
  const records = [{...base, id: "prod", paymentMode: "prod"}, {...base, id: "test", paymentMode: "test"}, {...base, id: "legacy"}];
  const db = {collection(path) {return {
    doc(id) {return {id, path: `${path}/${id}`, async get() {return {id, exists: true, data: () => parent};},
      async set(data, options) {assert.equal(options.merge, true); Object.assign(parent, data);}};},
    async get() {return {docs: records.map(record => ({id: record.id, exists: true, data: () => record}))};}
  };}};
  const app = {firestore: () => db};
  globalThis.firebase = {apps: [app], app: () => app, initializeApp: () => app, firestore: () => db};
  const repo = new FirestoreStudentSubscriptionRepository();
  assert.deepEqual((await repo.listPayments("student-a")).map(p => p.id).sort(), ["legacy", "prod"]);
  const student = await repo.getSubscription("student-a");
  assert.equal(student.billingSummary.paymentState, "paid");
  student.update({billingSummary: {paymentState: "failed"}, applicationStatus: "active"});
  await repo.saveSubscription(student);
  assert.equal(parent.billingSummary.paymentState, "paid");
  assert.equal(student.applicationStatus, "suspended");
  assert.equal(parent.applicationStatus, "suspended");
});

test("browser and backend subscription schema definitions remain synchronized", () => {
  const require = createRequire(import.meta.url);
  const backend = require("../../../functions/schema/subscription_schema.js").subscriptionSchema;
  assert.deepEqual(subscriptionSchema, backend);
});
