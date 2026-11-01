const firebaseOps = require("../../../utils/firebase/firebase_ops");
const {scope, reference, sameScope, millis, billingError} = require("../domain/subscription_invoice");
const {invoiceKey, invoiceData, summary, modeAllowed, selectSummary} = require("./firestore_subscription_billing_repository");
const {scopedRecovery, recoveryOwns} = require("../domain/renewal_recovery");

class FirestoreRenewalRecoveryRepository {
  constructor({getDocumentRef = firebaseOps.getDocumentRef, getFirestoreDb = firebaseOps.getFirestoreDb,
    now = () => new Date()} = {}) {Object.assign(this, {getDocumentRef, getFirestoreDb, now});}

  async listDueRenewalRecoveries({limit = 25} = {}) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw billingError("invalid-argument", "Invalid recovery limit.");
    const rows = await this.getFirestoreDb().collectionGroup("invoices")
      .where("renewalRecovery.nextActionAt", "<=", this.now()).orderBy("renewalRecovery.nextActionAt").limit(limit).get();
    return rows.docs.map(doc => {
      const invoice = invoiceData(doc.data());
      if (doc.ref.path !== `subscriptions/${invoice.studentId}/invoices/${invoiceKey(invoice, invoice.invoiceReference)}`) {
        throw billingError("failed-precondition", "Unexpected recovery document path.");
      }
      return {...scope(invoice), invoiceReference: invoice.invoiceReference};
    });
  }

  async mutate(input, operation) {
    const identity = scope(input), invoiceReference = reference(input.invoiceReference, "invoiceReference");
    const token = reference(input.leaseToken, "leaseToken"), now = this.now();
    const studentRef = this.getDocumentRef("subscriptions", identity.studentId);
    const key = invoiceKey(identity, invoiceReference);
    const invoiceRef = this.getDocumentRef(`subscriptions/${identity.studentId}/invoices`, key);
    const receiptRef = this.getDocumentRef(`subscriptions/${identity.studentId}/payments`, key);
    return this.getFirestoreDb().runTransaction(async transaction => {
      const [studentSnapshot, invoiceSnapshot, receiptSnapshot] = await Promise.all([
        transaction.get(studentRef), transaction.get(invoiceRef), transaction.get(receiptRef)]);
      const student = studentSnapshot.data(), invoice = invoiceData(invoiceSnapshot.data());
      if (!invoice?.renewalRecovery) return null;
      const cancellation = student?.subscriptionCancellation;
      if (cancellation?.state === "cancelled" && sameScope(cancellation, identity)) {
        transaction.set(invoiceRef, {...invoice, renewalRecovery: {...invoice.renewalRecovery,
          nextActionAt: null, leaseToken: null, leaseUntil: null}});
        return null;
      }
      if (!sameScope(invoice, identity) || invoice.studentId !== identity.studentId || invoice.invoiceReference !== invoiceReference) {
        throw billingError("failed-precondition", "Unexpected recovery scope.");
      }
      const selected = student && modeAllowed(student, invoice) && (recoveryOwns(student, invoice) || selectSummary(student, invoice));
      if (!selected) {
        transaction.set(invoiceRef, {...invoice, renewalRecovery: {...invoice.renewalRecovery, state: "manual_review",
          nextActionAt: null, leaseToken: null, leaseUntil: null, lastErrorCode: "subscription_context_changed"}});
        return null;
      }
      const result = operation(invoice.renewalRecovery, invoice, now, token);
      if (!result) return null;
      invoice.renewalRecovery = result; invoice.updatedAt = now;
      const patch = {renewalRecovery: scopedRecovery(invoice), billingSummary: summary(invoice, now), updatedAt: now};
      if (result.state === "completed") {
        if (invoice.paymentState !== "paid" || invoice.invoiceStatus !== "paid" || !result.paidAt || !result.paidThrough) {
          throw billingError("failed-precondition", "Recovery access requires a verified paid invoice and billing restart.");
        }
        patch.applicationStatus = "active"; patch.subscriptionType = "ongoing";
        Object.assign(patch, {paymentProvider: invoice.paymentProvider, paymentMode: invoice.paymentMode,
          paymentCustomerReference: invoice.paymentCustomerReference, paymentSubscriptionReference: invoice.paymentSubscriptionReference,
          planId: invoice.planId, activeUntil: !student.activeUntil || millis(student.activeUntil) < millis(result.paidThrough)
            ? result.paidThrough : student.activeUntil});
        patch.renewalGraceUntil = new Date(millis(patch.activeUntil) + millis(result.graceUntil) - millis(result.firstFailedAt));
        invoice.recoveredCoverageStart = result.paidAt; invoice.recoveredCoverageEnd = result.paidThrough;
        invoice.accessAppliedAt = invoice.accessAppliedAt || now;
        const receipt = receiptSnapshot.data() || {guardianId: invoice.guardianId, planId: invoice.planId,
          durationMonths: invoice.durationMonths, amountPaid: invoice.amountPaid / (10 ** invoice.currencyExponent),
          currency: invoice.currency, paymentDate: invoice.paidAt, paymentProvider: invoice.paymentProvider,
          paymentMode: invoice.paymentMode, paymentProviderReference: invoice.invoiceReference,
          paymentSubscriptionReference: invoice.paymentSubscriptionReference, createdAt: now};
        transaction.set(receiptRef, {...receipt, coverageStart: result.paidAt, coverageEnd: result.paidThrough});
      } else if (millis(now) >= millis(result.graceUntil)) patch.applicationStatus = "suspended";
      else patch.applicationStatus = student.applicationStatus || "active";
      transaction.set(invoiceRef, invoice); transaction.set(studentRef, {...student, ...patch});
      return invoice;
    });
  }

  async claimRenewalRecovery(input) {
    return this.mutate(input, (plan, _invoice, now, token) => {
      if (plan.state === "completed" || !plan.nextActionAt || millis(plan.nextActionAt) > millis(now)) return null;
      if (plan.leaseToken && millis(plan.leaseUntil) > millis(now)) return null;
      return {...plan, leaseToken: token, leaseUntil: new Date(millis(now) + 300000), nextActionAt: new Date(millis(now) + 300000)};
    });
  }
  async finishRenewalRecovery(input) {
    return this.mutate(input, (plan, invoice, now, token) => {
      if (plan.leaseToken !== token) return null;
      const free = {...plan, leaseToken: null, leaseUntil: null};
      if (input.outcome === "restarted") {
        if (invoice.paymentState !== "paid" || !plan.paidAt || !plan.paidThrough) throw billingError("failed-precondition", "Unverified recovery payment.");
        return {...free, state: "completed", completedAt: plan.completedAt || now, nextActionAt: null, lastErrorCode: null};
      }
      if (invoice.paymentState === "paid" && input.outcome === "held") {
        return {...free, state: "pending_reset", nextActionAt: now};
      }
      if (input.outcome === "held" || input.outcome === "suspended") {
        const expired = millis(now) >= millis(plan.graceUntil);
        return {...free, state: expired ? "suspended" : "held", nextActionAt: expired ? null : plan.graceUntil, lastErrorCode: null};
      }
      if (input.outcome === "manual_review") return {...free, state: "manual_review",
        nextActionAt: millis(now) < millis(plan.graceUntil) ? plan.graceUntil : null,
        lastErrorCode: plan.lastErrorCode || "billing_review_required"};
      if (input.outcome !== "error") throw billingError("invalid-argument", "Unknown recovery outcome.");
      return {...free, nextActionAt: new Date(millis(now) + 300000), lastErrorCode: "billing_control_unavailable"};
    });
  }
}
module.exports = {FirestoreRenewalRecoveryRepository};
