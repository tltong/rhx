const {randomUUID} = require("node:crypto");
const ops = require("../../../utils/firebase/firebase_ops");
const {id, error, hydrate, sanitize, billingSnapshot, dueAt, card} = require("../domain/subscription_payment_view");
class FirestoreSubscriptionPaymentViewRepository {
  constructor({getDocumentRef = ops.getDocumentRef, getFirestoreDb = ops.getFirestoreDb, readDocument = ops.readDocument,
    now = () => new Date()} = {}) {Object.assign(this, {getDocumentRef, getFirestoreDb, readDocument, now});}
  ref(scope) {
    if (!scope.studentId || scope.studentId.includes("/") || !["test", "prod"].includes(scope.mode)
      || !/^sub_[\w]+$/.test(scope.subscriptionReference)) throw error("Invalid subscription view scope.");
    return this.getDocumentRef(`subscriptions/${scope.studentId}/paymentViews`, id(scope));
  }
  verify(record, scope) {
    if (record && ["studentId", "mode", "subscriptionReference", "customerReference", "guardianId"].some(k => record[k] !== scope[k])) {
      throw error("Subscription view ownership changed.");
    }
  }
  async get(scope) {
    const ref = this.ref(scope), split = ref.path.lastIndexOf("/");
    const result = hydrate(await this.readDocument(ref.path.slice(0, split), ref.path.slice(split + 1), {includeId: false}));
    this.verify(result, scope); return result;
  }
  async request(scope, reason = "backfill", invalidate = false) {
    const ref = this.ref(scope), now = this.now();
    return this.getFirestoreDb().runTransaction(async tx => {
      let value = hydrate((await tx.get(ref)).data()); this.verify(value, scope);
      if (value && !invalidate) return value;
      value ||= {...Object.fromEntries(["studentId", "mode", "subscriptionReference", "customerReference", "guardianId"].map(k => [k, scope[k]])), version: 1, generation: 0, createdAt: now};
      if (invalidate) value.generation++;
      Object.assign(value, {pending: true, reason, nextActionAt: now, updatedAt: now});
      tx.set(ref, value); return value;
    });
  }
  async claim(scope) {
    const ref = this.ref(scope), now = this.now();
    return this.getFirestoreDb().runTransaction(async tx => {
      const value = hydrate((await tx.get(ref)).data()); this.verify(value, scope);
      if (!value || value.leaseUntil > now) return null;
      Object.assign(value, {leaseToken: randomUUID(), leaseUntil: new Date(+now + 180000), pending: true, nextActionAt: new Date(+now + 180000)});
      tx.set(ref, value); return value;
    });
  }
  async save(scope, details, subscription = null, paymentMethodReference = undefined, claim = null) {
    const ref = this.ref(scope), now = this.now(), payload = sanitize(details);
    if (payload.subscriptionReference !== scope.subscriptionReference || payload.studentId !== scope.studentId) throw error("Unexpected subscription view identity.");
    return this.getFirestoreDb().runTransaction(async tx => {
      const current = hydrate((await tx.get(ref)).data()); this.verify(current, scope);
      if (!current) throw error("Subscription view was not initialized.");
      if (claim && (current.leaseToken !== claim.leaseToken || current.generation !== claim.generation)) {
        if (current.leaseToken === claim.leaseToken) tx.set(ref, {...current, leaseToken: null, leaseUntil: null, pending: true, nextActionAt: now});
        return null;
      }
      const billing = subscription ? billingSnapshot(subscription) : {...current.billing, status: payload.subscriptionStatus};
      const value = {...current, generation: claim ? current.generation : current.generation + 1,
        payload, billing, defaultPaymentMethodReference: paymentMethodReference === undefined ? current.defaultPaymentMethodReference || null : paymentMethodReference,
        observedAt: now, updatedAt: now, pending: false, reason: null, lastErrorCode: null, attempts: 0,
        leaseToken: null, leaseUntil: null, nextActionAt: dueAt(payload, now)};
      tx.set(ref, value); return value;
    });
  }
  async fail(scope, claim, code = "unavailable") {
    const ref = this.ref(scope), now = this.now();
    return this.getFirestoreDb().runTransaction(async tx => {
      const value = hydrate((await tx.get(ref)).data()); this.verify(value, scope);
      if (!value || value.leaseToken !== claim.leaseToken) return;
      if (value.generation !== claim.generation) {
        tx.set(ref, {...value, leaseToken: null, leaseUntil: null, pending: true, nextActionAt: now}); return;
      }
      value.attempts = (value.attempts || 0) + 1;
      Object.assign(value, {pending: true, lastErrorCode: code, leaseToken: null, leaseUntil: null,
        nextActionAt: ["permission-denied", "not-found"].includes(code) ? null : new Date(+now + Math.min(3600000, 300000 * 2 ** Math.min(value.attempts - 1, 4))), updatedAt: now});
      tx.set(ref, value);
    });
  }
  async listDue({limit = 25} = {}) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw error("Invalid subscription view batch limit.", "invalid-argument");
    const rows = await this.getFirestoreDb().collectionGroup("paymentViews").where("nextActionAt", "<=", this.now()).orderBy("nextActionAt").limit(limit).get();
    return rows.docs.map(doc => {const value = hydrate(doc.data()); if (this.ref(value).path !== doc.ref.path) throw error("Unexpected subscription view path."); return value;});
  }
  async patchCard(scope, method) {
    await this.request(scope);
    const ref = this.ref(scope), now = this.now();
    return this.getFirestoreDb().runTransaction(async tx => {
      const current = hydrate((await tx.get(ref)).data()); this.verify(current, scope);
      const payload = current.payload ? {...current.payload, currentCard: card(method.card)} : null;
      if (payload?.renewal) payload.renewal = {...payload.renewal, savedCard: card(method.card)};
      tx.set(ref, {...current, ...(payload ? {payload} : {}), defaultPaymentMethodReference: method.paymentMethodReference,
        generation: current.generation + 1, pending: true, reason: "card_updated", nextActionAt: now, updatedAt: now});
    });
  }
}
module.exports = {FirestoreSubscriptionPaymentViewRepository};
