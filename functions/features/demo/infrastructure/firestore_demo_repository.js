const {randomUUID} = require("node:crypto");
const {getFirestoreDb} = require("../../../utils/firebase/firebase_ops");
const d = require("../domain/demo");

class FirestoreDemoRepository {
  constructor({getDb = getFirestoreDb, now = () => new Date()} = {}) {Object.assign(this, {getDb, now});}
  db() {return this.getDb();}
  ref(sessionId) {return this.db().collection("demoSessions").doc(sessionId);}
  attemptRef(sessionId, attemptId) {return this.ref(sessionId).collection("attempts").doc(d.id(attemptId));}
  newsRef(sessionId, newsType) {
    if (!["international", "local"].includes(newsType)) throw d.fail("Choose local or international news.");
    return this.ref(sessionId).collection("news").doc(newsType);
  }
  async start(token, sender = "unknown") {
    const sessionId = d.sessionId(token), root = this.ref(sessionId), now = this.now();
    const hour = Math.floor(now.getTime() / 3600000);
    const admission = this.db().collection("demoAdmission").doc(d.hash([sender, hour]));
    return this.db().runTransaction(async tx => {
      const existing = (await tx.get(root)).data();
      if (existing) {d.active(existing, now); return d.summary(existing);}
      const usage = (await tx.get(admission)).data();
      if ((usage?.count || 0) >= 40) throw d.fail("Too many demo starts. Please try again later.", "resource-exhausted");
      const session = {status: "active", createdAt: now, expiresAt: new Date(now.getTime() + d.SESSION_MS), scope: null,
        activeAttemptId: null, totals: {startingCoins: 1, practiceCoins: 0, newsCoins: 0, totalCoins: 1, practicesCompleted: 0, newsCompleted: 0}};
      tx.set(admission, {count: (usage?.count || 0) + 1, expiresAt: new Date((hour + 2) * 3600000)});
      tx.create(root, session);
      return d.summary(session);
    });
  }
  async read(token) {
    const sessionId = d.sessionId(token), session = (await this.ref(sessionId).get()).data();
    return {sessionId, session: d.active(session, this.now())};
  }
  async transaction(sessionId, operation) {
    return this.db().runTransaction(async tx => {
      const ref = this.ref(sessionId), session = (await tx.get(ref)).data();
      d.active(session, this.now());
      return operation({tx, ref, session});
    });
  }
  async readAttempt(token, attemptId) {
    const owner = await this.read(token), attempt = (await this.attemptRef(owner.sessionId, attemptId).get()).data();
    if (!attempt) throw d.fail("This practice was not found in your demo.", "not-found");
    if (attempt.hasQuestionItems) {
      const items = await this.attemptRef(owner.sessionId, attemptId).collection("items").orderBy("position").get();
      if (items.size !== attempt.questionCount) throw d.fail("This practice has ended or its questions are unavailable.", "failed-precondition");
      attempt.questions = items.docs.map(doc => doc.data().question);
    }
    return {...owner, attempt};
  }
  async updateNews(sessionId, newsType, operation) {
    return this.transaction(sessionId, async ({tx, session}) => {
      const ref = this.newsRef(sessionId, newsType), current = (await tx.get(ref)).data();
      if (!current) throw d.fail("Open a news article first.", "not-found");
      const patch = await operation(current, session);
      tx.set(ref, {...current, ...patch});
      return {...current, ...patch};
    });
  }
  async claim(sessionId, attemptId, sequence) {
    try {
      return await this.transaction(sessionId, async ({tx, session}) => {
        const ref = this.attemptRef(sessionId, attemptId), attempt = (await tx.get(ref)).data();
        if (!attempt || attempt.status !== "queued" || attempt.requestSequence !== sequence) return null;
        const leaseToken = randomUUID(), patch = {status: "running", leaseToken, leaseUntil: new Date(this.now().getTime() + d.LEASE_MS)};
        tx.update(ref, patch);
        return {...attempt, ...patch, sessionScope: session.scope};
      });
    } catch (error) {if (error.code === "failed-precondition") return null; throw error;}
  }
  async checkpoint(sessionId, attempt, patch) {
    try {
      return await this.transaction(sessionId, async ({tx, ref: root, session}) => {
        const ref = this.attemptRef(sessionId, attempt.attemptId), current = (await tx.get(ref)).data();
        if (current?.status !== "running" || current.leaseToken !== attempt.leaseToken) return false;
        const changes = {...patch, leaseToken: null, leaseUntil: null, updatedAt: this.now()};
        if (patch.questions) {
          for (const [position, question] of patch.questions.entries()) {
            tx.create(ref.collection("items").doc(String(position)), {position, question});
          }
          delete changes.questions;
          changes.hasQuestionItems = true;
        }
        if (patch.status === "queued") changes.requestSequence = current.requestSequence + 1;
        tx.update(ref, changes);
        if (patch.status === "ready" || patch.status === "completed" || patch.status === "failed") {
          if (session.activeAttemptId === attempt.attemptId) tx.update(root, {activeAttemptId: null});
        }
        return true;
      });
    } catch (error) {if (error.code === "failed-precondition") return false; throw error;}
  }
  async finish(token) {
    const sessionId = d.sessionId(token), ref = this.ref(sessionId);
    const totals = await this.db().runTransaction(async tx => {
      const session = (await tx.get(ref)).data();
      if (session?.status === "finished" && d.millis(session.expiresAt) > this.now().getTime()) return d.summary(session);
      d.active(session, this.now());
      const ended = {status: "finished", totals: session.totals, expiresAt: new Date(this.now().getTime() + 600000)};
      tx.set(ref, ended); return d.summary(ended);
    });
    // The revoked root fences workers even when a deletion needs a cleanup retry.
    try {await Promise.all(["attempts", "news"].map(name => this.remove(ref.collection(name))));}
    catch {require("firebase-functions/logger").warn("Demo activity deletion deferred to expiry cleanup");}
    return totals;
  }
  async poolLease(scope, operation) {
    const ref = this.db().collection("demoQuestionPoolLeases").doc(d.hash(scope)), token = randomUUID();
    await this.db().runTransaction(async tx => {
      const current = (await tx.get(ref)).data();
      if (current && d.millis(current.expiresAt) > this.now().getTime()) throw d.fail("Another request is preparing these questions.", "demo-pool-busy");
      tx.set(ref, {token, expiresAt: new Date(this.now().getTime() + d.LEASE_MS)});
    });
    try {return await operation();}
    finally {
      await this.db().runTransaction(async tx => {
        const current = (await tx.get(ref)).data();
        if (current?.token === token) tx.delete(ref);
      });
    }
  }
  async cleanup() {
    let removed = 0;
    for (const name of ["demoSessions", "demoAdmission", "demoQuestionPoolLeases"]) {
      const expired = await this.db().collection(name).where("expiresAt", "<=", this.now()).limit(100).get();
      for (const doc of expired.docs) {await this.remove(doc.ref); removed++;}
    }
    return {removed};
  }
  async remove(ref) {
    const writer = this.db().bulkWriter();
    try {await this.db().recursiveDelete(ref, writer);}
    finally {await writer.close();}
  }
}
module.exports = {FirestoreDemoRepository};
