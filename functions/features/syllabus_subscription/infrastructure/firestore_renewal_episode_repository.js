const firebaseOps = require("../../../utils/firebase/firebase_ops");
const {hash, hydrate, error, recoveryProjection, retryProjection, nextAction} = require("../domain/renewal_episode");
const {invoiceKey} = require("./firestore_subscription_billing_repository");
class FirestoreRenewalEpisodeRepository {
  constructor({getDocumentRef = firebaseOps.getDocumentRef, getFirestoreDb = firebaseOps.getFirestoreDb,
    now = () => new Date()} = {}) {Object.assign(this, {getDocumentRef, getFirestoreDb, now});}
  refs(input) {
    if (!input.studentId || input.studentId.includes("/") || !/^[a-f0-9]{64}$/.test(input.id)) throw error("Invalid recovery identity.");
    return {student: this.getDocumentRef("subscriptions", input.studentId),
      episode: this.getDocumentRef(`subscriptions/${input.studentId}/renewalEpisodes`, input.id)};
  }
  async get(input) {return this.getFirestoreDb().runTransaction(async tx => hydrate((await tx.get(this.refs(input).episode)).data()));}
  async lifecycle(input, subscriptionStatus) {
    const refs = this.refs(input);
    return this.getFirestoreDb().runTransaction(async tx => {
      const s = hydrate((await tx.get(refs.student)).data());
      if (s?.renewalRecovery?.episodeReference !== input.id) return;
      tx.set(refs.student, {...s, billingSummary: {...s.billingSummary, subscriptionStatus}, updatedAt: this.now()});
    });
  }
  async mutate(input, operation, initialize = null) {
    const refs = this.refs(input), now = this.now();
    return this.getFirestoreDb().runTransaction(async tx => {
      const [s, snapshot] = await Promise.all([tx.get(refs.student), tx.get(refs.episode)]);
      const student = hydrate(s.data()); let e = hydrate(snapshot.data());
      if (!student) throw error("Student subscription is unavailable.");
      if (!e && !initialize) return null;
      if (!e) {
        if (student.renewalRecovery && student.renewalRecovery.state !== "completed") throw error("Another recovery already owns this student.");
        if (student.paymentMode === "prod" && initialize.mode === "test") throw error("Production access cannot be replaced by test recovery.");
        const current = student.billingSummary?.paymentProvider === "stripe" ? student.billingSummary : student;
        if (current.paymentSubscriptionReference && (current.paymentSubscriptionReference !== initialize.subscriptionReference
          || current.paymentMode !== initialize.mode)) throw error("A different subscription now owns this student's billing.");
        e = hydrate(initialize);
      }
      if (e.id !== input.id || e.studentId !== input.studentId) throw error("Recovery identity mismatch.");
      const owns = student.renewalRecovery?.episodeReference === e.id;
      if (snapshot.exists && !owns) return null; // An older episode cannot change a newer subscription.
      const changed = operation(e, now);
      if (!changed) return null;
      e = changed; e.updatedAt = now; e.nextActionAt = nextAction(e, now);
      const patch = {renewalRecovery: recoveryProjection(e), updatedAt: now,
        billingSummary: {...student.billingSummary, paymentProvider: "stripe", paymentMode: e.mode,
          paymentSubscriptionReference: e.subscriptionReference, paymentCustomerReference: e.customerReference,
          invoiceReference: e.completedInvoiceReference || e.originalInvoiceReference,
          invoiceStatus: e.state === "completed" ? "paid" : e.attempt ? ["failed", "cancelled"].includes(e.attempt.state) ? "void" : "draft" : e.originalDropped ? "void" : "open",
          billingReason: "subscription_cycle", amountRemaining: e.state === "completed" ? 0
            : e.attempt && !["failed", "cancelled"].includes(e.attempt.state) ? e.attempt.terms.amount
              : e.originalDropped ? 0 : e.originalInvoice.amountDue,
          currency: e.currency, currencyExponent: e.originalInvoice.currencyExponent,
          failureCode: e.state === "completed" ? null : e.reason, lastFailedAt: e.firstFailedAt,
          nextPaymentAttemptAt: e.nextRetryAt || null, invoiceCreatedAt: e.attempt?.createdAt || e.originalInvoice.invoiceCreatedAt,
          subscriptionRegisteredAt: e.subscriptionRegisteredAt, observedAt: now,
          paymentState: e.state === "completed" ? "paid" : e.state === "pending_reset" ? "processing" : "failed",
          subscriptionStatus: e.state === "completed" ? "trialing" : "paused",
          renewalRecovery: recoveryProjection(e), renewalRetry: retryProjection(e), updatedAt: now},
        applicationStatus: e.state === "completed" ? "active" : now >= e.graceUntil ? "suspended" : student.applicationStatus || "active"};
      const identity = {studentId: e.studentId, guardianId: e.guardianId, paymentProvider: "stripe", paymentMode: e.mode,
        paymentCustomerReference: e.customerReference, paymentSubscriptionReference: e.subscriptionReference};
      const originalKey = invoiceKey(identity, e.originalInvoiceReference);
      tx.set(this.getDocumentRef(`subscriptions/${e.studentId}/invoices`, originalKey), {...identity,
        invoiceReference: e.originalInvoiceReference, recoveryEpisodeReference: e.id, planId: e.originalPlanId,
        billingReason: "subscription_cycle", invoiceStatus: e.originalDropped ? "void" : "open",
        paymentState: e.originalDropped ? "unavailable" : "failed", paymentIntentStatus: null, paymentIntentReference: null,
        subscriptionStatus: "paused", amountDue: e.originalInvoice.amountDue, amountPaid: 0,
        amountRemaining: e.originalDropped ? 0 : e.originalInvoice.amountDue, currency: e.currency,
        currencyExponent: e.originalInvoice.currencyExponent, invoiceCreatedAt: e.originalInvoice.invoiceCreatedAt,
        subscriptionRegisteredAt: e.subscriptionRegisteredAt, observedAt: now, createdAt: e.createdAt, updatedAt: now,
        billingPeriodStart: e.originalInvoice.billingPeriodStart, billingPeriodEnd: e.originalInvoice.billingPeriodEnd,
        durationMonths: null, lastFailedAt: e.firstFailedAt, paidAt: null, attemptCount: e.originalInvoice.attemptCount,
        isLatestInvoice: !e.attempt && e.state !== "completed", nextPaymentAttemptAt: null});
      if (e.attempt?.invoiceReference && e.state !== "completed") {
        const a = e.attempt, closed = ["failed", "cancelled"].includes(a.state);
        tx.set(this.getDocumentRef(`subscriptions/${e.studentId}/invoices`, invoiceKey(identity, a.invoiceReference)), {...identity,
          invoiceReference: a.invoiceReference, recoveryEpisodeReference: e.id, planId: a.planId,
          billingReason: "subscription_cycle", stripeBillingReason: "manual", invoiceStatus: closed ? "void" : "draft",
          paymentState: closed ? "unavailable" : "processing", subscriptionStatus: "paused",
          paymentIntentReference: a.paymentIntentReference || null, paymentIntentStatus: a.state,
          amountDue: a.terms.amount, amountPaid: 0, amountRemaining: closed ? 0 : a.terms.amount,
          currency: a.terms.currency, currencyExponent: a.currencyExponent, invoiceCreatedAt: a.createdAt,
          subscriptionRegisteredAt: e.subscriptionRegisteredAt, observedAt: now, createdAt: a.createdAt, updatedAt: now,
          billingPeriodStart: a.paidAt || null, billingPeriodEnd: a.paidThrough || null, paidAt: a.paidAt || null,
          durationMonths: a.durationMonths, attemptCount: 1, isLatestInvoice: true, nextPaymentAttemptAt: null});
      }
      if (e.state === "completed") {
        if (!e.paidAt || !e.paidThrough || !e.completedInvoiceReference || e.attempt?.state !== "completed") throw error("Unverified recovered coverage.");
        Object.assign(patch, {subscriptionType: "ongoing", paymentProvider: "stripe", paymentMode: e.mode,
          paymentSubscriptionReference: e.subscriptionReference, paymentCustomerReference: e.customerReference,
          planId: e.attempt.planId, activeUntil: e.paidThrough,
          renewalGraceUntil: new Date(+e.paidThrough + e.policy.gracePeriodHours * 3600000)});
        const key = invoiceKey({paymentProvider: "stripe", paymentMode: e.mode, paymentSubscriptionReference: e.subscriptionReference}, e.completedInvoiceReference);
        const receipt = this.getDocumentRef(`subscriptions/${e.studentId}/payments`, key);
        const invoice = this.getDocumentRef(`subscriptions/${e.studentId}/invoices`, key);
        tx.set(receipt, {guardianId: e.guardianId, planId: e.attempt.planId,
          durationMonths: e.attempt.durationMonths, amountPaid: e.attempt.terms.amount / 10 ** e.attempt.currencyExponent,
          currency: e.attempt.terms.currency, paymentDate: e.paidAt, coverageStart: e.paidAt, coverageEnd: e.paidThrough,
          paymentProvider: "stripe", paymentMode: e.mode, paymentProviderReference: e.completedInvoiceReference,
          paymentSubscriptionReference: e.subscriptionReference, createdAt: e.completedAt});
        tx.set(invoice, {studentId: e.studentId, guardianId: e.guardianId, planId: e.attempt.planId,
          paymentProvider: "stripe", paymentMode: e.mode, paymentCustomerReference: e.customerReference,
          paymentSubscriptionReference: e.subscriptionReference, invoiceReference: e.completedInvoiceReference,
          invoiceStatus: "paid", paymentState: "paid", billingReason: "subscription_cycle", stripeBillingReason: "manual",
          recoveryEpisodeReference: e.id, paymentIntentReference: e.attempt.paymentIntentReference,
          amountDue: e.attempt.terms.amount, amountPaid: e.attempt.terms.amount, amountRemaining: 0,
          currency: e.attempt.terms.currency, currencyExponent: e.attempt.currencyExponent,
          billingPeriodStart: e.paidAt, billingPeriodEnd: e.paidThrough, paidAt: e.paidAt,
          invoiceCreatedAt: e.attempt.createdAt, subscriptionRegisteredAt: e.subscriptionRegisteredAt,
          observedAt: now, createdAt: e.attempt.createdAt, updatedAt: now, accessAppliedAt: e.completedAt,
          durationMonths: e.attempt.durationMonths, attemptCount: 1, isLatestInvoice: true});
      }
      tx.set(refs.episode, e); tx.set(refs.student, {...student, ...patch});
      return e;
    });
  }
  async initialize(input) {
    const e = {...input, id: hash([input.mode, input.subscriptionReference, input.originalInvoiceReference])};
    return this.mutate(e, existing => existing, e);
  }
  async listDue({limit = 25} = {}) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw error("Invalid recovery batch size.");
    const result = await this.getFirestoreDb().collectionGroup("renewalEpisodes")
      .where("nextActionAt", "<=", this.now()).orderBy("nextActionAt").limit(limit).get();
    return result.docs.map(doc => {
      const e = hydrate(doc.data());
      if (doc.ref.path !== `subscriptions/${e.studentId}/renewalEpisodes/${e.id}`) throw error("Unexpected recovery path.");
      return {studentId: e.studentId, id: e.id};
    });
  }
}
module.exports = {FirestoreRenewalEpisodeRepository};
