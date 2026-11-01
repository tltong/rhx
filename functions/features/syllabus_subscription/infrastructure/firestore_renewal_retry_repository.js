const firebaseOps = require("../../../utils/firebase/firebase_ops");
const {scope, reference, sameScope, billingError, documentKey} = require("../domain/subscription_invoice");
const {claimRetry, beginAttempt, finishRetry, TERMINAL} = require("../domain/renewal_retry");
const {invoiceKey, invoiceData, summary, selectSummary} = require("./firestore_subscription_billing_repository");

class FirestoreRenewalRetryRepository {
  constructor({getDocumentRef = firebaseOps.getDocumentRef, getFirestoreDb = firebaseOps.getFirestoreDb,
    now = () => new Date()} = {}) {
    Object.assign(this, {getDocumentRef, getFirestoreDb, now});
  }
  async listDueRenewalRetries({limit = 25} = {}) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw billingError("invalid-argument", "Invalid retry batch limit.");
    const result = await this.getFirestoreDb().collectionGroup("invoices")
      .where("renewalRetry.nextActionAt", "<=", this.now())
      .orderBy("renewalRetry.nextActionAt").limit(limit).get();
    return result.docs.map(doc => {
      const invoice = invoiceData(doc.data());
      // A collection-group match is not sufficient to trust arbitrary paths.
      const expected = `subscriptions/${invoice.studentId}/invoices/${invoiceKey(invoice, invoice.invoiceReference)}`;
      if (doc.ref.path !== expected) throw billingError("failed-precondition", "Unexpected retry document path.");
      return {...scope(invoice), invoiceReference: invoice.invoiceReference};
    });
  }
  async mutate(input, change) {
    const identity = scope(input);
    const invoiceReference = reference(input.invoiceReference, "invoiceReference");
    const studentRef = this.getDocumentRef("subscriptions", identity.studentId);
    const invoiceRef = this.getDocumentRef(`subscriptions/${identity.studentId}/invoices`, invoiceKey(identity, invoiceReference));
    const now = this.now();
    return this.getFirestoreDb().runTransaction(async transaction => {
      const [studentSnapshot, invoiceSnapshot] = await Promise.all([transaction.get(studentRef), transaction.get(invoiceRef)]);
      const invoice = invoiceData(invoiceSnapshot.data());
      if (!invoice) return null;
      if (!sameScope(invoice, identity) || invoice.studentId !== identity.studentId || invoice.invoiceReference !== invoiceReference) {
        throw billingError("failed-precondition", "Unexpected retry invoice scope.");
      }
      if (!invoice.renewalRetry || invoice.paymentState === "paid") return null;
      const student = studentSnapshot.data();
      let retry;
      if (!student) {
        retry = {...invoice.renewalRetry, state: "stopped", nextActionAt: null, nextAttemptAt: null,
          leaseToken: null, leaseUntil: null, lastOutcome: "student_subscription_unavailable"};
      } else retry = change(invoice.renewalRetry, invoice, now, student);
      if (!retry) return null;
      const updated = {...invoice, renewalRetry: retry, updatedAt: now};
      transaction.set(invoiceRef, updated);
      if (student && selectSummary(student, updated)) {
        transaction.set(studentRef, {...student, billingSummary: summary(updated, now), updatedAt: now,
          applicationStatus: retry.state === "exhausted" ? "suspended" : student.applicationStatus || "active"});
      }
      // These writes never modify activeUntil, subscriptionType or any access field.
      return updated;
    });
  }
  async claimRenewalRetry(input) {
    const token = reference(input.leaseToken, "leaseToken");
    return this.mutate(input, (plan, invoice, now, student) => {
      if (!invoice.isLatestInvoice || invoice.billingReason !== "subscription_cycle" || !selectSummary(student, invoice)) {
        return {...plan, state: "stopped", nextActionAt: null, nextAttemptAt: null, leaseToken: null,
          leaseUntil: null, lastOutcome: "superseded_invoice"};
      }
      return claimRetry(plan, token, now);
    });
  }
  async beginRenewalRetryAttempt(input) {
    const token = reference(input.leaseToken, "leaseToken");
    const method = reference(input.paymentMethodReference, "paymentMethodReference");
    return this.mutate(input, (plan, invoice, now) => {
      if (TERMINAL.has(plan.state)) return null;
      return beginAttempt(plan, {token, paymentMethodReference: method, now,
        attemptReference: documentKey(invoice.paymentProvider, invoice.paymentMode,
          `${invoice.paymentSubscriptionReference}:${invoice.invoiceReference}:${plan.attemptsMade + 1}`)});
    });
  }
  async finishRenewalRetry(input) {
    const token = reference(input.leaseToken, "leaseToken");
    const reason = input.reason == null ? null : reference(input.reason, "reason");
    return this.mutate(input, (plan, _invoice, now) => finishRetry(plan,
      {token, outcome: input.outcome, reason, nextAttemptAt: input.nextAttemptAt, now}));
  }
}
module.exports = {FirestoreRenewalRetryRepository};
