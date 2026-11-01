const {observeRecovery, recoveryData, scopedRecovery, recoveryOwns, publicRecovery} = require("../domain/renewal_recovery");
const {FieldPath} = require("firebase-admin/firestore");
const firebaseOps = require("../../../utils/firebase/firebase_ops");
const {SubscriptionBillingRepository} = require("../domain/subscription_billing_repository");
const {documentKey, sameScope, assertInvoiceIdentity, timestamp, millis,
  billingError} = require("../domain/subscription_invoice");
const {observeRetry, retryData, publicRetry} = require("../domain/renewal_retry");

function prefix(scope) {
  return documentKey(scope.paymentProvider, scope.paymentMode, scope.paymentSubscriptionReference) + "_";
}
function invoiceKey(scope, reference) {
  return prefix(scope) + documentKey(scope.paymentProvider, scope.paymentMode, reference).split("_").at(-1);
}
const dateFields = ["invoiceCreatedAt", "subscriptionRegisteredAt", "observedAt", "billingPeriodStart",
  "billingPeriodEnd", "nextPaymentAttemptAt", "lastFailedAt", "paidAt", "createdAt", "updatedAt", "accessAppliedAt", "recoveredCoverageStart", "recoveredCoverageEnd"];
function invoiceData(data) {
  if (!data) return null;
  const result = {...data};
  for (const field of dateFields) if (result[field] != null) result[field] = timestamp(result[field], field);
  if (result.renewalRecovery) result.renewalRecovery = recoveryData(result.renewalRecovery);
  if (result.renewalRetry) result.renewalRetry = retryData(result.renewalRetry);
  return result;
}
function newerDate(first, second) {return millis(first) >= millis(second) ? first || null : second || null;}
function mergeInvoice(existing, incoming, initialize) {
  if (!existing) return incoming;
  assertInvoiceIdentity(existing, incoming);
  const paidWins = incoming.paymentState === "paid" && existing.paymentState !== "paid";
  const older = millis(incoming.observedAt) < millis(existing.observedAt)
    || incoming.attemptCount < existing.attemptCount;
  const preserve = initialize || (existing.paymentState === "paid" && incoming.paymentState !== "paid")
    || (older && !paidWins);
  if (preserve) return existing;
  return {...incoming, createdAt: existing.createdAt, accessAppliedAt: existing.accessAppliedAt,
    ...(existing.renewalRecovery ? {renewalRecovery: existing.renewalRecovery} : {}),
    ...(existing.renewalRetry ? {renewalRetry: existing.renewalRetry} : {}),
    lastFailedAt: newerDate(existing.lastFailedAt, incoming.lastFailedAt),
    attemptCount: Math.max(existing.attemptCount, incoming.attemptCount)};
}
function modeAllowed(student, invoice) {
  return !(invoice.paymentMode === "test"
    && (student.paymentMode === "prod" || student.billingSummary?.paymentMode === "prod"));
}
function selectSummary(student, invoice) {
  if (!modeAllowed(student, invoice)) return false;
  if (student.renewalRecovery && sameScope(student.renewalRecovery, invoice)
    && student.renewalRecovery.state !== "completed" && !recoveryOwns(student, invoice)) return false;
  if (!invoice.isLatestInvoice && !recoveryOwns(student, invoice)) return false;
  if (student.renewalRecovery && sameScope(student.renewalRecovery, invoice)
    && !["subscription_cycle", "subscription_create"].includes(invoice.billingReason)) return false;
  const current = student.billingSummary;
  if (current) {
    if (sameScope(current, invoice)) {
      return invoice.invoiceReference === current.invoiceReference
        || millis(invoice.invoiceCreatedAt) > millis(current.invoiceCreatedAt)
        || (millis(invoice.invoiceCreatedAt) === millis(current.invoiceCreatedAt)
          && millis(invoice.observedAt) >= millis(current.observedAt));
    }
    if (invoice.paymentMode === "prod" && current.paymentMode === "test") return true;
    return millis(invoice.subscriptionRegisteredAt) > millis(current.subscriptionRegisteredAt);
  }
  if (student.paymentSubscriptionReference && !sameScope(student, invoice)) {
    if (student.paymentMode === "test" && invoice.paymentMode === "prod") return true;
    return millis(invoice.subscriptionRegisteredAt) >= millis(student.updatedAt);
  }
  return true;
}
function summary(invoice, now) {
  return {paymentProvider: invoice.paymentProvider, paymentMode: invoice.paymentMode,
    paymentSubscriptionReference: invoice.paymentSubscriptionReference,
    paymentCustomerReference: invoice.paymentCustomerReference,
    invoiceReference: invoice.invoiceReference, invoiceStatus: invoice.invoiceStatus, billingReason: invoice.billingReason,
    paymentState: invoice.paymentState, paymentIntentStatus: invoice.paymentIntentStatus,
    subscriptionStatus: invoice.subscriptionStatus, amountRemaining: invoice.amountRemaining,
    currency: invoice.currency, currencyExponent: invoice.currencyExponent,
    failureCode: invoice.paymentState === "failed" ? invoice.failureCode : null,
    lastFailedAt: invoice.paymentState === "failed" ? invoice.lastFailedAt : null,
    nextPaymentAttemptAt: invoice.renewalRetry ? invoice.renewalRetry.nextAttemptAt : invoice.nextPaymentAttemptAt,
    ...(invoice.renewalRecovery ? {renewalRecovery: publicRecovery(invoice.renewalRecovery)} : {}),
    ...(invoice.renewalRetry ? {renewalRetry: publicRetry(invoice.renewalRetry)} : {}),
    invoiceCreatedAt: invoice.invoiceCreatedAt, subscriptionRegisteredAt: invoice.subscriptionRegisteredAt,
    observedAt: invoice.observedAt, updatedAt: now};
}
function paidInvoice(invoice) {
  return invoice.paymentState === "paid" && invoice.invoiceStatus === "paid"
    && ["subscription_create", "subscription_cycle"].includes(invoice.billingReason)
    && invoice.billingPeriodStart && invoice.billingPeriodEnd && invoice.durationMonths;
}

function paidCoverage(invoice) {return !invoice.renewalRecovery && paidInvoice(invoice);}

class FirestoreSubscriptionBillingRepository extends SubscriptionBillingRepository {
  constructor({getDocumentRef = firebaseOps.getDocumentRef, getFirestoreDb = firebaseOps.getFirestoreDb,
    readDocument = firebaseOps.readDocument, getCollectionRef = firebaseOps.getCollectionRef} = {}) {
    super(); Object.assign(this, {getDocumentRef, getFirestoreDb, readDocument, getCollectionRef});
  }
  async initializeInvoiceRecord(invoiceRecord) {return this.commit({invoiceRecord, initialize: true});}
  async recordInvoicePaymentEvent(input) {return this.commit({...input, initialize: false});}

  async commit({invoiceRecord: incoming, initialize, eventReference, eventType, eventCreatedAt, renewalRetryPolicy}) {
    const parentPath = `subscriptions/${incoming.studentId}`;
    const key = invoiceKey(incoming, incoming.invoiceReference);
    const studentRef = this.getDocumentRef("subscriptions", incoming.studentId);
    const invoiceRef = this.getDocumentRef(`${parentPath}/invoices`, key);
    const receiptRef = this.getDocumentRef(`${parentPath}/payments`, key);
    const eventRef = initialize ? null : this.getDocumentRef(`${parentPath}/billingEvents`,
      documentKey(incoming.paymentProvider, incoming.paymentMode, eventReference));
    return this.getFirestoreDb().runTransaction(async transaction => {
      const [studentSnapshot, invoiceSnapshot, receiptSnapshot, eventSnapshot] = await Promise.all([
        transaction.get(studentRef), transaction.get(invoiceRef), transaction.get(receiptRef),
        eventRef ? transaction.get(eventRef) : null,
      ]);
      if (!studentSnapshot.exists) throw billingError("not-found", "The student subscription was not found.");
      const student = studentSnapshot.data(), existing = invoiceData(invoiceSnapshot.data());
      if (existing) assertInvoiceIdentity(existing, incoming);
      if (eventSnapshot?.exists) {
        if (eventSnapshot.data().invoiceKey !== key) throw billingError("failed-precondition", "Event identity cannot change.");
        return {duplicate: true, created: false, invoiceRecord: existing,
          summaryUpdated: false, accessUpdated: false, receiptCreated: false};
      }
      const invoice = {...mergeInvoice(existing, incoming, initialize)};
      const retry = observeRetry(existing?.renewalRetry, invoice, {policy: renewalRetryPolicy,
        eventType, eventCreatedAt, now: incoming.updatedAt});
      if (retry) invoice.renewalRetry = retry;
      const upgrading = (existing?.renewalRetry || (existing?.paymentState === "failed" && existing.lastFailedAt)) && !existing.renewalRecovery && renewalRetryPolicy?.gracePeriodHours !== undefined;
      const recovery = observeRecovery(existing?.renewalRecovery, invoice, {policy: renewalRetryPolicy,
        eventType: upgrading ? "invoice.payment_failed" : eventType,
        eventCreatedAt: upgrading ? existing.renewalRetry?.firstFailedAt || existing.lastFailedAt : eventCreatedAt, now: incoming.updatedAt});
      if (recovery) invoice.renewalRecovery = recovery;
      if (upgrading && invoice.renewalRetry && invoice.renewalRetry.gracePeriodHours === undefined) {
        invoice.renewalRetry.gracePeriodHours = renewalRetryPolicy.gracePeriodHours;
      }
      const summaryUpdated = selectSummary(student, invoice)
        && !(initialize && existing && sameScope(student.billingSummary, invoice)
          && student.billingSummary.invoiceReference === invoice.invoiceReference);
      const patch = {};
      if (summaryUpdated) patch.billingSummary = summary(invoice, incoming.updatedAt);
      if (summaryUpdated && recovery) {
        patch.renewalRecovery = scopedRecovery(invoice);
        patch.applicationStatus = recovery.state === "completed" ? "active"
          : millis(incoming.updatedAt) >= millis(recovery.graceUntil) ? "suspended" : student.applicationStatus || "active";
      }
      if (summaryUpdated && !recovery && (retry || invoice.paymentState === "paid")) {
        patch.applicationStatus = invoice.paymentState === "paid" ? "active"
          : retry?.state === "exhausted" ? "suspended" : student.applicationStatus || "active";
      }
      const contextMatches = sameScope(student, invoice) || summaryUpdated
        || sameScope(student.billingSummary, invoice);
      const blockedByRecovery = student.renewalRecovery && student.renewalRecovery.state !== "completed"
        && sameScope(student.renewalRecovery, invoice) && !recoveryOwns(student, invoice);
      const accessUpdated = !!(!blockedByRecovery && paidCoverage(invoice) && !invoice.accessAppliedAt
        && contextMatches && modeAllowed(student, invoice));
      if (accessUpdated) {
        const modePromotion = student.paymentMode === "test" && invoice.paymentMode === "prod";
        Object.assign(patch, {subscriptionType: "ongoing", paymentProvider: invoice.paymentProvider,
          paymentMode: invoice.paymentMode, paymentCustomerReference: invoice.paymentCustomerReference,
          paymentSubscriptionReference: invoice.paymentSubscriptionReference, planId: invoice.planId,
          activeUntil: modePromotion ? invoice.billingPeriodEnd : newerDate(student.activeUntil, invoice.billingPeriodEnd)});
        invoice.accessAppliedAt = incoming.updatedAt;
      }
      if (summaryUpdated && paidInvoice(invoice) && !recovery && renewalRetryPolicy?.gracePeriodHours) {
        const paidUntil = patch.activeUntil || student.activeUntil;
        if (paidUntil) patch.renewalGraceUntil = new Date(millis(paidUntil) + renewalRetryPolicy.gracePeriodHours * 3600000);
      }
      const cancellation = student.subscriptionCancellation;
      if (cancellation?.state === "cancelled" && sameScope(cancellation, invoice)) {
        const end = newerDate(cancellation.accessUntil, patch.activeUntil || student.activeUntil);
        patch.subscriptionCancellation = {...cancellation, accessUntil: end};
        patch.applicationStatus = millis(end) > millis(incoming.updatedAt) ? "active" : "suspended";
        patch.renewalGraceUntil = null;
      }
      const receiptCreated = !!(paidInvoice(invoice) && !receiptSnapshot.exists);
      if (receiptCreated) transaction.set(receiptRef, {
        guardianId: invoice.guardianId, planId: invoice.planId, durationMonths: invoice.durationMonths,
        amountPaid: invoice.amountPaid / (10 ** invoice.currencyExponent), currency: invoice.currency,
        paymentDate: invoice.paidAt, paymentProvider: invoice.paymentProvider,
        paymentMode: invoice.paymentMode, paymentProviderReference: invoice.invoiceReference,
        paymentSubscriptionReference: invoice.paymentSubscriptionReference,
        createdAt: incoming.updatedAt,
      });
      if (Object.keys(patch).length) transaction.set(studentRef, {...student, ...patch, updatedAt: incoming.updatedAt});
      if (!initialize || !existing || accessUpdated) transaction.set(invoiceRef, invoice);
      if (eventRef) transaction.set(eventRef, {eventReference, eventType, eventCreatedAt,
        paymentProvider: invoice.paymentProvider, paymentMode: invoice.paymentMode,
        invoiceKey: key, processedAt: incoming.updatedAt});
      return {duplicate: false, created: !existing, invoiceRecord: invoice,
        summaryUpdated, accessUpdated, receiptCreated};
    });
  }

  async getInvoiceRecord(input) {
    const result = invoiceData(await this.readDocument(`subscriptions/${input.studentId}/invoices`,
      invoiceKey(input, input.invoiceReference), {includeId: false}));
    if (result && !sameScope(result, input)) throw billingError("failed-precondition", "Unexpected invoice scope.");
    return result;
  }
  async listInvoiceRecords(input) {
    const start = prefix(input);
    if (input.cursor && (!input.cursor.startsWith(start) || !/^[a-f0-9]{64}$/.test(input.cursor.slice(start.length)))) {
      throw billingError("invalid-argument", "Invalid invoice cursor.");
    }
    let query = this.getCollectionRef(`subscriptions/${input.studentId}/invoices`).orderBy(FieldPath.documentId());
    query = input.cursor ? query.startAfter(input.cursor) : query.startAt(start);
    const snapshot = await query.endBefore(start + "\uffff").limit(input.limit + 1).get();
    const docs = snapshot.docs.slice(0, input.limit);
    const invoices = docs.map(doc => invoiceData(doc.data()));
    if (invoices.some(record => !sameScope(record, input))) throw billingError("failed-precondition", "Unexpected invoice scope.");
    return {invoices,
      nextCursor: snapshot.docs.length > input.limit ? docs.at(-1).id : null};
  }
}
module.exports = {FirestoreSubscriptionBillingRepository, invoiceKey, prefix, invoiceData, summary, selectSummary, modeAllowed};
