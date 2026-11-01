const firebaseOps = require("../../../utils/firebase/firebase_ops");
function date(value) {return value?.toDate?.() || value;}
function failure(message) {return Object.assign(Error(message), {code: "failed-precondition"});}
class FirestoreSubscriptionPlanChangeRepository {
  constructor({getDocumentRef = firebaseOps.getDocumentRef, getFirestoreDb = firebaseOps.getFirestoreDb,
    now = () => new Date()} = {}) {Object.assign(this, {getDocumentRef, getFirestoreDb, now});}
  document(input) {
    if (!["test", "prod"].includes(input.mode) || !/^cus_[\w]+$/.test(input.customerReference)
      || !/^sub_[\w]+$/.test(input.subscriptionReference)) throw failure("Invalid plan change scope.");
    return this.getDocumentRef(`stripeCustomers/${input.mode}/customers/${input.customerReference}/subscriptions`, input.subscriptionReference);
  }
  async claim(input) {
    const ref = this.document(input), now = this.now();
    return this.getFirestoreDb().runTransaction(async transaction => {
      const snapshot = await transaction.get(ref), record = snapshot.data();
      if (!record || record.studentId !== input.studentId) throw failure("This student subscription is unavailable.");
      if (record.pendingPlanChange?.leaseToken && date(record.pendingPlanChange.leaseUntil) > now) {
        throw failure("Another plan update is in progress. Refresh before trying again.");
      }
      const previous = record.pendingPlanChange;
      const sameTarget = previous && previous.planId === input.planId && previous.priceReference === input.priceReference
        && +date(previous.effectiveAt) === +input.effectiveAt;
      if (previous?.state === "updating" && date(previous.effectiveAt) > now && !sameTarget) {
        throw failure("Confirm the pending plan update before choosing a different plan.");
      }
      if (previous?.idempotencyReference === input.idempotencyReference && !sameTarget) {
        throw failure("Use a new attempt reference for a different plan change.");
      }
      const versions = record.planVersions || [{planId: record.planId, priceReference: input.currentPriceReference,
        amount: record.amount, currency: record.currency, interval: record.interval, intervalCount: record.intervalCount,
        effectiveAt: input.subscriptionStartDate}];
      if (versions.length >= 1000) throw failure("This subscription's plan history needs support review.");
      if (!versions.some(version => version.planId === input.planId && version.priceReference === input.priceReference
        && +date(version.effectiveAt) === +input.effectiveAt)) versions.push({planId: input.planId,
        priceReference: input.priceReference, amount: input.terms.amount, currency: input.terms.currency,
        interval: input.terms.interval, intervalCount: input.terms.intervalCount, effectiveAt: input.effectiveAt});
      const change = {state: "updating", planId: input.planId, priceReference: input.priceReference,
        idempotencyReference: previous?.state === "updating" && sameTarget ? previous.idempotencyReference || input.idempotencyReference : input.idempotencyReference,
        scheduleWasAbsent: previous?.state === "updating" && sameTarget ? previous.scheduleWasAbsent === true : !input.existingScheduleReference,
        effectiveAt: input.effectiveAt, leaseToken: input.leaseToken, leaseUntil: new Date(+now + 300000),
        scheduleReference: record.pendingPlanChange?.scheduleReference || null};
      transaction.set(ref, {...record, planVersions: versions, pendingPlanChange: change, updatedAt: now});
      return change;
    });
  }
  async finish(input) {
    const ref = this.document(input);
    return this.getFirestoreDb().runTransaction(async transaction => {
      const snapshot = await transaction.get(ref), record = snapshot.data();
      if (record?.pendingPlanChange?.leaseToken !== input.leaseToken) return false;
      if (input.priceReference && record.pendingPlanChange.priceReference !== input.priceReference
        || input.effectiveAt && +date(record.pendingPlanChange.effectiveAt) !== +input.effectiveAt) return false;
      transaction.set(ref, {...record, pendingPlanChange: {...record.pendingPlanChange,
        state: input.scheduleReference ? "scheduled" : "updating", scheduleReference: input.scheduleReference || record.pendingPlanChange.scheduleReference,
        leaseToken: null, leaseUntil: null}, updatedAt: this.now()});
      return true;
    });
  }
  async applyRecoveredPlan(input) {
    const ref = this.document(input);
    return this.getFirestoreDb().runTransaction(async transaction => {
      const snapshot = await transaction.get(ref), record = snapshot.data();
      if (!record || record.studentId !== input.studentId) throw failure("Recovered subscription registration is unavailable.");
      const versions = record.planVersions || [{planId: record.planId, priceReference: input.previousPriceReference,
        amount: record.amount, currency: record.currency, interval: record.interval, intervalCount: record.intervalCount,
        effectiveAt: date(record.createdAt)}];
      if (!versions.some(v => v.priceReference === input.priceReference && +date(v.effectiveAt) === +input.effectiveAt)) {
        if (versions.length >= 1000) throw failure("Plan history requires review.");
        versions.push({planId: input.planId, priceReference: input.priceReference, amount: input.terms.amount,
          currency: input.terms.currency, interval: input.terms.interval, intervalCount: input.terms.intervalCount,
          effectiveAt: input.effectiveAt});
      }
      transaction.set(ref, {...record, planId: input.planId, amount: input.terms.amount, currency: input.terms.currency,
        interval: input.terms.interval, intervalCount: input.terms.intervalCount, planVersions: versions,
        pendingPlanChange: null, updatedAt: this.now()});
    });
  }
}
module.exports = {FirestoreSubscriptionPlanChangeRepository};
