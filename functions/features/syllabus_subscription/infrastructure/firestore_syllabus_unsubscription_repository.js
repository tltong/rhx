const {getFirestoreDb} = require("../../../utils/firebase/firebase_ops");
const {subjectStateReference} = require("../../subject_assessment/domain/student_subject_assessment");
const {id, problem} = require("../../subject_assessment/domain/subject_assessment");
const {scan} = require("../../subject_assessment/infrastructure/firestore_subject_assessment_repository");
const {createHash} = require("node:crypto");

class FirestoreSyllabusUnsubscriptionRepository {
  constructor({getDb = getFirestoreDb, now = () => Date.now(), uuid = () => globalThis.crypto.randomUUID()} = {}) {
    Object.assign(this, {getDb, now, uuid});
  }
  state(studentId, syllabusId) {return subjectStateReference(this.getDb(), id(studentId), id(syllabusId));}
  response(scope, status) {return {studentId: scope.studentId, syllabusId: scope.syllabusId, unsubscribed: true, cleanupStatus: status};}
  async begin(scope, access) {
    const db = this.getDb(), stateRef = this.state(scope.studentId, scope.syllabusId);
    const receiptRef = stateRef.collection("unsubscriptions").doc(scope.requestId);
    const parent = db.collection("syllabusSubscriptions").doc(scope.studentId), subscription = parent.collection("syllabuses").doc(scope.syllabusId);
    return db.runTransaction(async tx => {
      const [receipt, state, subscribed, remaining] = await Promise.all([tx.get(receiptRef), tx.get(stateRef), tx.get(subscription), tx.get(parent.collection("syllabuses").limit(2))]);
      if (!access.administrator && (await tx.get(db.doc("guardianStudentLinks/" + access.uid + "__" + scope.studentId))).data()?.state !== "active") {
        throw problem("This guardian link is no longer active.", "permission-denied");
      }
      if (receipt.exists) return {...scope, cleanupId: receipt.data().cleanupId};
      const previous = state.data()?.cleanup;
      // Different tabs join the same cleanup; a retry after resubscription never deletes the new subscription.
      if (["pending", "running"].includes(previous?.status)) {
        tx.create(receiptRef, {cleanupId: previous.id, requestedBy: access.uid, createdAt: new Date(this.now())});
        return {...scope, cleanupId: previous.id};
      }
      if (!subscribed.exists && previous?.status === "completed") {
        tx.create(receiptRef, {cleanupId: previous.id, requestedBy: access.uid, createdAt: new Date(this.now())});
        return {...scope, cleanupId: previous.id};
      }
      const cleanupId = this.uuid(), now = new Date(this.now());
      tx.set(stateRef, {studentId: scope.studentId, syllabusId: scope.syllabusId, activeGenerationId: null,
        lastSubmittedAt: null, lastSubmittedAssessmentId: null, updatedAt: now,
        cleanup: {id: cleanupId, status: "pending", requestedBy: access.uid, requestedAt: now, completedAt: null,
          planReady: false, leaseToken: null, leaseUntil: null}}, {merge: true});
      tx.create(receiptRef, {cleanupId, requestedBy: access.uid, createdAt: now});
      tx.delete(subscription);
      if (remaining.docs.every(doc => doc.id === scope.syllabusId)) tx.delete(parent);
      return {...scope, cleanupId};
    });
  }
  async guard(tx, scope, token) {
    const ref = this.state(scope.studentId, scope.syllabusId), state = await tx.get(ref), cleanup = state.data()?.cleanup;
    if (cleanup?.id !== scope.cleanupId || cleanup?.status !== "running" || cleanup?.leaseToken !== token) {
      throw problem("This cleanup worker was replaced.", "cleanup-lease-lost");
    }
    return {ref, cleanup};
  }
  async renew(scope, token) {
    await this.getDb().runTransaction(async tx => {
      const {ref, cleanup} = await this.guard(tx, scope, token);
      tx.update(ref, {cleanup: {...cleanup, leaseUntil: new Date(this.now() + 10 * 60 * 1000)}, updatedAt: new Date(this.now())});
    });
  }
  async clean(scope) {
    const db = this.getDb(), ref = this.state(scope.studentId, scope.syllabusId), token = this.uuid();
    const claimed = await db.runTransaction(async tx => {
      const saved = await tx.get(ref), cleanup = saved.data()?.cleanup;
      if (!cleanup || cleanup.id !== scope.cleanupId || cleanup.status === "completed") return "completed";
      if (cleanup.leaseUntil?.toMillis() > this.now()) return "pending";
      tx.update(ref, {cleanup: {...cleanup, status: "running", leaseToken: token, leaseUntil: new Date(this.now() + 10 * 60 * 1000)}, updatedAt: new Date(this.now())});
      return "claimed";
    });
    if (claimed !== "claimed") return this.response(scope, claimed);
    try {
      const manifest = ref.collection("cleanupItems");
      if (!(await ref.get()).data().cleanup.planReady) {
        const matching = async collection => (await scan(db.collection(collection).where("studentId", "==", scope.studentId)))
          .filter(doc => doc.data().syllabusId === scope.syllabusId);
        const [jobs, papers, submissions, results] = await Promise.all([
          matching("subjectAssessmentGenerations"), matching("subjectAssessments"), matching("subjectAssessmentSubmissions"), matching("subjectAssessmentResults"),
        ]);
        const assessmentIds = new Set([...papers, ...submissions, ...results].map(doc => doc.id));
        for (const job of jobs) if (job.data().assessmentId) assessmentIds.add(id(job.data().assessmentId));
        const targets = [...jobs.map(job => ({kind: "generation", targetId: job.id})),
          ...[...assessmentIds].map(targetId => ({kind: "assessment", targetId}))];
        // A job may be the only pointer to staged children. Persist targets before deleting it.
        for (let offset = 0; offset < targets.length; offset += 250) await db.runTransaction(async tx => {
          await this.guard(tx, scope, token);
          for (const target of targets.slice(offset, offset + 250)) {
            const key = createHash("sha256").update(JSON.stringify([scope.cleanupId, target.kind, target.targetId])).digest("hex");
            tx.set(manifest.doc(key), {...target, cleanupId: scope.cleanupId});
          }
        });
        await db.runTransaction(async tx => {
          const {cleanup} = await this.guard(tx, scope, token);
          tx.update(ref, {cleanup: {...cleanup, planReady: true}});
        });
      }
      const targets = await scan(manifest.where("cleanupId", "==", scope.cleanupId));
      const jobs = targets.filter(doc => doc.data().kind === "generation");
      // Release this subject's generation lease without touching another subject's work.
      await db.runTransaction(async tx => {
        await this.guard(tx, scope, token);
        const lock = db.doc("subjectAssessmentGenerations/_locks/students/" + scope.studentId), saved = await tx.get(lock);
        if (jobs.some(job => job.data().targetId === saved.data()?.requestId)) tx.delete(lock);
      });
      for (const job of jobs) {
        await this.renew(scope, token);
        await db.recursiveDelete(db.collection("subjectAssessmentGenerations").doc(job.data().targetId));
        await job.ref.delete();
      }
      for (const target of targets.filter(doc => doc.data().kind === "assessment")) {
        const assessmentId = target.data().targetId;
        await this.renew(scope, token);
        for (const collection of ["subjectAssessments", "subjectAssessmentSubmissions", "subjectAssessmentResults"]) {
          await db.recursiveDelete(db.collection(collection).doc(assessmentId));
        }
        await target.ref.delete();
      }
      await db.runTransaction(async tx => {
        const {cleanup} = await this.guard(tx, scope, token), now = new Date(this.now());
        tx.update(ref, {activeGenerationId: null, lastSubmittedAt: null, lastSubmittedAssessmentId: null, updatedAt: now,
          cleanup: {...cleanup, status: "completed", completedAt: now, leaseToken: null, leaseUntil: null}});
      });
      return this.response(scope, "completed");
    } catch (error) {
      await db.runTransaction(async tx => {
        const {cleanup} = await this.guard(tx, scope, token);
        tx.update(ref, {cleanup: {...cleanup, status: "pending", leaseToken: null, leaseUntil: null}, updatedAt: new Date(this.now())});
      }).catch(() => {});
      throw error;
    }
  }
}

module.exports = {FirestoreSyllabusUnsubscriptionRepository};
