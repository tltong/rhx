const {createHash, randomUUID} = require("node:crypto");
const ops = require("../../../utils/firebase/firebase_ops");
const {hydrate} = require("../domain/renewal_episode");
const {accessEnd, matches, projection} = require("../domain/subscription_cancellation");
function failure(message) {return Object.assign(Error(message), {code: "failed-precondition"});}
class FirestoreSubscriptionCancellationRepository {
  constructor({getDocumentRef = ops.getDocumentRef, getFirestoreDb = ops.getFirestoreDb,
    readDocument = ops.readDocument, now = () => new Date()} = {}) {
    Object.assign(this, {getDocumentRef, getFirestoreDb, readDocument, now});
  }
  refs(input) {
    if (!input.studentId || input.studentId.includes("/") || !["test", "prod"].includes(input.mode)
      || !/^sub_[\w]+$/.test(input.subscriptionReference)) throw failure("Invalid cancellation identity.");
    const id = createHash("sha256").update(JSON.stringify([input.mode, input.subscriptionReference])).digest("hex");
    return {student: this.getDocumentRef("subscriptions", input.studentId),
      request: this.getDocumentRef(`subscriptions/${input.studentId}/subscriptionCancellations`, id)};
  }
  async get(input) {
    const path = this.refs(input).request.path, split = path.lastIndexOf("/");
    // A single strongly consistent document read needs no transaction or lease.
    return hydrate(await this.readDocument(path.slice(0, split), path.slice(split + 1), {includeId: false}));
  }
  async begin(input) {
    const refs = this.refs(input), now = this.now();
    return this.getFirestoreDb().runTransaction(async tx => {
      const [s, r] = await Promise.all([tx.get(refs.student), tx.get(refs.request)]);
      if (!s.exists) throw failure("Student subscription is unavailable.");
      if (r.exists) {
        const existing = hydrate(r.data());
        if (existing.guardianId !== input.guardianId || existing.customerReference !== input.customerReference) throw failure("Unexpected cancellation owner.");
        return existing;
      }
      const student = hydrate(s.data()), current = student.billingSummary?.paymentSubscriptionReference ? student.billingSummary : student;
      if (current.paymentSubscriptionReference && !matches(current, input.mode, input.subscriptionReference)) {
        throw failure("A different subscription now manages this student.");
      }
      const recovery = student.renewalRecovery;
      const episodeRef = recovery?.version === 2 && matches(recovery, input.mode, input.subscriptionReference)
        ? this.getDocumentRef(`subscriptions/${input.studentId}/renewalEpisodes`, recovery.episodeReference) : null;
      const episode = episodeRef ? hydrate((await tx.get(episodeRef)).data()) : null;
      const record = {studentId: input.studentId, mode: input.mode, subscriptionReference: input.subscriptionReference,
        customerReference: input.customerReference, guardianId: input.guardianId, state: "pending", requestedAt: now,
        accessUntil: accessEnd(student, input.mode, input.subscriptionReference), nextActionAt: now,
        episodeReference: episode?.id || null, cancelledAt: null, leaseToken: null, leaseUntil: null};
      if (episode && episode.state !== "completed") tx.set(episodeRef, {...episode, cancellationRequestedAt: now, nextRetryAt: null, nextActionAt: now});
      tx.set(refs.request, record);
      tx.set(refs.student, {...student, subscriptionCancellation: projection(record), updatedAt: now});
      return record;
    });
  }
  async claim(input) {
    const refs = this.refs(input), now = this.now();
    return this.getFirestoreDb().runTransaction(async tx => {
      const r = hydrate((await tx.get(refs.request)).data());
      if (!r || r.state === "cancelled" || r.leaseUntil > now) return null;
      r.leaseToken = randomUUID(); r.leaseUntil = new Date(+now + 300000); r.nextActionAt = r.leaseUntil;
      tx.set(refs.request, r); return r;
    });
  }
  async finish(input, cancelled) {
    const refs = this.refs(input), now = this.now();
    return this.getFirestoreDb().runTransaction(async tx => {
      const [s, r] = await Promise.all([tx.get(refs.student), tx.get(refs.request)]);
      const record = hydrate(r.data()), student = hydrate(s.data());
      if (!record || record.leaseToken !== input.leaseToken) return;
      Object.assign(record, {leaseToken: null, leaseUntil: null, nextActionAt: cancelled ? null : new Date(+now + 300000)});
      if (cancelled) {
        record.state = "cancelled"; record.cancelledAt ||= now;
        record.accessUntil = accessEnd(student, record.mode, record.subscriptionReference);
        record.nextActionAt = record.accessUntil > now ? record.accessUntil : null;
      }
      tx.set(refs.request, record);
      if (!matches(student.subscriptionCancellation, record.mode, record.subscriptionReference)) return;
      const patch = {subscriptionCancellation: projection(record), updatedAt: now};
      if (cancelled) {
        patch.renewalGraceUntil = null;
        patch.applicationStatus = record.accessUntil > now ? "active" : "suspended";
        if (matches(student.billingSummary, record.mode, record.subscriptionReference)) {
          patch.billingSummary = {...student.billingSummary, subscriptionStatus: "canceled", nextPaymentAttemptAt: null};
        }
      }
      tx.set(refs.student, {...student, ...patch});
    });
  }
  async listDue({limit = 25} = {}) {
    const result = await this.getFirestoreDb().collectionGroup("subscriptionCancellations")
      .where("nextActionAt", "<=", this.now()).orderBy("nextActionAt").limit(limit).get();
    return result.docs.map(doc => {
      const record = hydrate(doc.data());
      if (this.refs(record).request.path !== doc.ref.path) throw failure("Unexpected cancellation path.");
      return record;
    });
  }
  async expire(input) {
    const refs = this.refs(input), now = this.now();
    return this.getFirestoreDb().runTransaction(async tx => {
      const [s, r] = await Promise.all([tx.get(refs.student), tx.get(refs.request)]);
      const student = hydrate(s.data()), record = hydrate(r.data());
      if (!record || record.state !== "cancelled") return;
      record.nextActionAt = null;
      if (student && matches(student.subscriptionCancellation, record.mode, record.subscriptionReference)) {
        record.accessUntil = accessEnd(student, record.mode, record.subscriptionReference);
        if (record.accessUntil > now) record.nextActionAt = record.accessUntil;
        tx.set(refs.student, {...student, subscriptionCancellation: projection(record),
          applicationStatus: record.accessUntil > now ? "active" : "suspended", updatedAt: now});
      }
      tx.set(refs.request, record);
    });
  }
}
module.exports = {FirestoreSubscriptionCancellationRepository};
