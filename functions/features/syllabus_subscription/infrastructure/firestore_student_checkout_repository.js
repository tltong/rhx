const firebaseOps = require("../../../utils/firebase/firebase_ops");
const {createHash} = require("node:crypto");
function failure(message) {return Object.assign(Error(message), {code: "failed-precondition"});}
function validId(value) {
  if (typeof value !== "string" || !value.trim() || value.includes("/")) throw failure("Invalid checkout identity.");
  return value;
}
class FirestoreStudentCheckoutRepository {
  constructor({getDocumentRef = firebaseOps.getDocumentRef, getFirestoreDb = firebaseOps.getFirestoreDb,
    readDocument = firebaseOps.readDocument, now = () => new Date()} = {}) {Object.assign(this, {getDocumentRef, getFirestoreDb, readDocument, now});}
  document({studentId, mode}) {
    if (!["test", "prod"].includes(mode)) throw failure("Invalid checkout mode.");
    return this.getDocumentRef(`subscriptions/${validId(studentId)}/checkouts`, `stripe_${mode}`);
  }
  async get(input) {
    this.document(input);
    return this.readDocument(`subscriptions/${input.studentId}/checkouts`, `stripe_${input.mode}`, {includeId: false});
  }
  async claim(input) {
    const ref = this.document(input), studentRef = this.getDocumentRef("subscriptions", input.studentId), now = this.now();
    return this.getFirestoreDb().runTransaction(async transaction => {
      const [snapshot, student] = await Promise.all([transaction.get(ref), transaction.get(studentRef)]);
      const billing = student.data();
      if (!student.exists) throw failure("Student subscription record is unavailable.");
      if (billing.subscriptionCancellation?.state === "pending") throw failure("Wait for subscription cancellation to be confirmed before creating another subscription.");
      if (billing.paymentProvider === "stripe" && billing.paymentSubscriptionReference
        && billing.paymentMode === input.mode && billing.paymentSubscriptionReference !== input.allowedPreviousReference) {
        throw failure("This student already has a subscription. Open it to continue.");
      }
      const existing = snapshot.data();
      const replacing = input.replacePrevious === true && existing?.subscriptionReference
        && existing.subscriptionReference === input.allowedPreviousReference;
      if (existing && !replacing) {
        if (existing.internalReference !== input.internalReference || existing.planId !== input.planId
          || existing.country !== input.country || existing.customerReference !== input.customerReference
          || existing.paymentMethodReference !== input.paymentMethodReference
          || JSON.stringify(existing.billingTerms) !== JSON.stringify(input.billingTerms)) {
          throw failure("A checkout is already in progress for this student. Finish that checkout first.");
        }
        const created = existing.createdAt?.toDate?.() || existing.createdAt;
        if (!existing.subscriptionReference && now - created >= 23 * 3600000) {
          throw failure("This interrupted checkout needs support review before another subscription can be created.");
        }
        return existing;
      }
      const checkout = Object.fromEntries(["studentId", "mode", "internalReference", "customerReference",
        "paymentMethodReference", "country", "planId", "billingTerms"].map(key => [key, input[key]]));
      checkout.idempotencyReference = "student-checkout-" + createHash("sha256")
        .update(JSON.stringify([input.mode, input.studentId, input.internalReference, input.idempotencyReference])).digest("hex");
      checkout.createdAt = now; checkout.updatedAt = now; checkout.subscriptionReference = null;
      checkout.requestReference = input.idempotencyReference;
      const cancellation = billing.subscriptionCancellation;
      if (cancellation?.state === "cancelled" && cancellation.paymentMode === input.mode
        && cancellation.paymentSubscriptionReference === input.allowedPreviousReference) {
        checkout.previousSubscriptionReference = input.allowedPreviousReference;
        const paidUntil = billing.activeUntil?.toDate?.() || billing.activeUntil;
        if (billing.subscriptionType === "ongoing" && paidUntil instanceof Date && paidUntil > now) checkout.billingStartsAt = new Date(Math.floor(+paidUntil / 1000) * 1000);
      }
      transaction.set(ref, checkout);
      return checkout;
    });
  }
  async complete(input) {
    const ref = this.document(input), studentRef = this.getDocumentRef("subscriptions", input.studentId);
    return this.getFirestoreDb().runTransaction(async transaction => {
      const [snapshot, studentSnapshot] = await Promise.all([transaction.get(ref), transaction.get(studentRef)]), checkout = snapshot.data();
      if (!checkout || checkout.idempotencyReference !== input.idempotencyReference
        || checkout.internalReference !== input.internalReference
        || checkout.subscriptionReference && checkout.subscriptionReference !== input.subscriptionReference) {
        throw failure("Checkout identity changed before completion.");
      }
      transaction.set(ref, {...checkout, subscriptionReference: input.subscriptionReference, updatedAt: this.now()});
      const student = studentSnapshot.data(), c = student?.subscriptionCancellation;
      if (checkout.previousSubscriptionReference && c?.state === "cancelled" && c.paymentMode === input.mode
        && c.paymentSubscriptionReference === checkout.previousSubscriptionReference) {
        const until = c.accessUntil?.toDate?.() || c.accessUntil;
        transaction.set(studentRef, {...student, subscriptionType: "ongoing", paymentProvider: "stripe", paymentMode: input.mode,
          paymentCustomerReference: checkout.customerReference, paymentSubscriptionReference: input.subscriptionReference,
          planId: checkout.planId, subscriptionCancellation: null, renewalRecovery: null, billingSummary: null,
          renewalGraceUntil: checkout.billingStartsAt ? null : until || this.now(),
          applicationStatus: until > this.now() ? "active" : "suspended", updatedAt: this.now()});
      }
    });
  }
}
module.exports = {FirestoreStudentCheckoutRepository};
