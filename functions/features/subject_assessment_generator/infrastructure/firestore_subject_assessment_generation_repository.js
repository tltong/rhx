const {getFirestoreDb} = require("../../../utils/firebase/firebase_ops");
const {id, clean, scope, sameScope, problem, slotId, publicItem, summary, validateItems} = require("../../subject_assessment/domain/subject_assessment");
const {subjectStateReference, subscriptionKey} = require("../../subject_assessment/domain/student_subject_assessment");
const {guardAssessmentCleanup} = require("../../subject_assessment/infrastructure/subject_assessment_cleanup_guard");

class FirestoreSubjectAssessmentGenerationRepository {
  constructor({getDb = getFirestoreDb, now = () => Date.now(), uuid = () => globalThis.crypto.randomUUID()} = {}) {Object.assign(this, {getDb, now, uuid});}
  ref(requestId) {
    const key = id(requestId, "Request ID");
    if (["_locks", "_students"].includes(key)) throw problem("Invalid request ID.");
    return this.getDb().collection("subjectAssessmentGenerations").doc(key);
  }
  lock(studentId) {return this.getDb().doc("subjectAssessmentGenerations/_locks/students/" + id(studentId));}
  async get(requestId) {
    const snapshot = await this.ref(requestId).get();
    if (!snapshot.exists) return null;
    const {leaseToken, leaseUntil, ...data} = snapshot.data();
    return clean({generationId: snapshot.id, ...data});
  }
  async claim(input, configuration, access) {
    const selected = scope(input), reference = this.ref(input.requestId), token = this.uuid();
    return this.getDb().runTransaction(async tx => {
      access.assertAccess?.();
      await guardAssessmentCleanup(this.getDb(), tx, selected.studentId, selected.syllabusId);
      const previous = await tx.get(reference), existing = previous.data();
      if (existing && !sameScope(existing, selected)) throw problem("This request ID belongs to a different student or subject.", "already-exists");
      if (existing?.status === "completed") return {...clean(existing), generationId: reference.id};
      if (input.generationRequest !== undefined && existing?.generationRequest !== input.generationRequest) throw problem("This preparation request was replaced.", "generation-request-superseded");
      if (existing?.entryPoint === "student" && (await tx.get(subjectStateReference(this.getDb(), selected.studentId, selected.syllabusId))).data()?.activeGenerationId !== reference.id) {
        throw problem("This preparation request was replaced.", "generation-request-superseded");
      }
      if (existing?.subscriptionKey) {
        const subscription = await tx.get(this.getDb().collection("syllabusSubscriptions").doc(selected.studentId).collection("syllabuses").doc(selected.syllabusId));
        if (subscription.data()?.state !== "active" || subscriptionKey(subscription) !== existing.subscriptionKey) {
          throw problem("This subject subscription was replaced or deactivated.", "generation-request-superseded");
        }
      }
      const lock = await tx.get(this.lock(selected.studentId));
      if (lock.exists && lock.data().leaseUntil.toMillis() > this.now()) throw problem("An assessment is already being generated for this student.", "generation-in-progress");
      const now = new Date(this.now()), leaseUntil = new Date(this.now() + 10 * 60 * 1000);
      const data = clean({...selected, language: configuration.language, assessmentId: existing?.assessmentId || this.uuid(),
        configurationSnapshot: existing?.configurationSnapshot || configuration,
        contextSnapshot: existing?.contextSnapshot || clean({level: input.syllabus?.level?.toLowerCase(), grade: input.syllabus?.year,
          subject: input.syllabus?.subject, country: input.syllabus?.country}), status: "generating", createdBy: existing?.createdBy || access.uid,
        startedAt: existing?.startedAt || now, updatedAt: now, completedAt: null,
        progress: existing?.progress || {prepared: 0, total: configuration.topics.reduce((total, topic) => total + topic.totalCount, 0), reused: 0, generated: 0},
        leaseToken: token, leaseUntil, errorCode: null, errorMessage: null});
      if (existing?.entryPoint === "student") Object.assign(data, {entryPoint: "student", clientRequestId: existing.clientRequestId,
        generationRequest: existing.generationRequest, requestedAt: existing.requestedAt});
      if (existing?.entryPoint === "student") Object.assign(data, clean({origin: existing.origin, subscriptionKey: existing.subscriptionKey}));
      tx.set(reference, data);
      tx.set(this.lock(selected.studentId), {requestId: reference.id, leaseToken: token, leaseUntil});
      return {...data, generationId: reference.id};
    });
  }
  async guard(tx, state, {active = true} = {}) {
    await guardAssessmentCleanup(this.getDb(), tx, state.studentId, state.syllabusId);
    const [job, lock] = await Promise.all([tx.get(this.ref(state.generationId)), tx.get(this.lock(state.studentId))]);
    if (job.data()?.status !== "generating" || job.data()?.leaseToken !== state.leaseToken || lock.data()?.leaseToken !== state.leaseToken) {
      throw problem("This generation attempt has been replaced.", "generation-lease-lost");
    }
    if (active && job.data().entryPoint === "student" && (await tx.get(subjectStateReference(this.getDb(), state.studentId, state.syllabusId))).data()?.activeGenerationId !== state.generationId) {
      throw problem("This preparation request was replaced.", "generation-request-superseded");
    }
    if (active && job.data().subscriptionKey) {
      const subscription = await tx.get(this.getDb().collection("syllabusSubscriptions").doc(state.studentId).collection("syllabuses").doc(state.syllabusId));
      if (subscription.data()?.state !== "active" || subscriptionKey(subscription) !== job.data().subscriptionKey) {
        throw problem("This subject subscription was replaced or deactivated.", "generation-request-superseded");
      }
    }
    return job.data();
  }
  async checkpoint(state, position) {
    const snapshot = await this.ref(state.generationId).collection("items").doc(slotId(position)).get();
    return snapshot.exists ? clean(snapshot.data()) : null;
  }
  async saveCheckpoint(state, position, value, progress, access) {
    await this.getDb().runTransaction(async tx => {
      await this.guard(tx, state); access.assertAccess?.();
      const now = new Date(this.now()), leaseUntil = new Date(this.now() + 10 * 60 * 1000);
      tx.set(this.ref(state.generationId).collection("items").doc(slotId(position)), clean(value));
      tx.update(this.ref(state.generationId), {progress, updatedAt: now, leaseUntil});
      tx.update(this.lock(state.studentId), {leaseUntil});
    });
  }
  async publish(state, items, access) {
    validateItems(state.configurationSnapshot, items);
    const db = this.getDb(), assessment = db.collection("subjectAssessments").doc(state.assessmentId);
    // Stage frozen content in bounded transactions; no assessment is readable until its parent is published.
    for (let offset = 0; offset < items.length; offset += 100) {
      await db.runTransaction(async tx => {
        await this.guard(tx, state); access.assertAccess?.();
        for (const item of items.slice(offset, offset + 100)) {
          tx.set(assessment.collection("items").doc(slotId(item.position)), publicItem(item));
          tx.set(assessment.collection("private").doc(slotId(item.position)), {marking: item.marking});
        }
      });
    }
    await db.runTransaction(async tx => {
      await this.guard(tx, state);
      const launchRef = state.entryPoint === "student" ? subjectStateReference(db, state.studentId, state.syllabusId) : null;
      if (launchRef) {
        const query = name => db.collection(name).where("studentId", "==", state.studentId).where("syllabusId", "==", state.syllabusId);
        const [papers, submissions] = await Promise.all([tx.get(query("subjectAssessments")), tx.get(query("subjectAssessmentSubmissions"))]);
        const submitted = new Set(submissions.docs.filter(doc => doc.data().status === "submitted").map(doc => doc.id));
        if (papers.docs.some(doc => doc.id !== state.assessmentId && !submitted.has(doc.id))) throw problem("Another unfinished assessment is already available. Resume it from your dashboard.", "failed-precondition");
      }
      const refs = items.map(item => db.collection("studentSubjectAssessmentUsage").doc(state.studentId).collection("items").doc(item.sourceKey));
      const history = await Promise.all(refs.map(ref => tx.get(ref)));
      if (history.some(snapshot => snapshot.exists)) throw problem("Selected content was used by another assessment. Retry generation.", "content-already-used");
      access.assertAccess?.();
      const generatedAt = new Date(this.now());
      tx.set(assessment, clean({studentId: state.studentId, syllabusId: state.syllabusId, language: state.language,
        configurationVersion: state.configurationSnapshot.version, configurationSnapshot: state.configurationSnapshot, contextSnapshot: state.contextSnapshot,
        generationId: state.generationId, createdBy: state.createdBy, generatedAt, ...summary(items)}));
      for (let index = 0; index < items.length; index++) {
        const item = items[index];
        tx.set(refs[index], {sourceKey: item.sourceKey, identity: item.identity, sourceReference: item.sourceReference, questionType: item.questionType,
          syllabusId: state.syllabusId, topicId: item.topicId, language: state.language, assessmentId: state.assessmentId, selectedAt: generatedAt});
      }
      tx.update(this.ref(state.generationId), {status: "completed", updatedAt: generatedAt, completedAt: generatedAt, leaseToken: null, leaseUntil: null,
        progress: {prepared: items.length, total: items.length, reused: summary(items).reusedCount, generated: summary(items).generatedCount}});
      tx.delete(this.lock(state.studentId));
      if (launchRef) tx.set(launchRef, {activeGenerationId: null, updatedAt: generatedAt}, {merge: true});
    });
  }
  async fail(state, error) {
    await this.getDb().runTransaction(async tx => {
      await this.guard(tx, state, {active: false});
      tx.update(this.ref(state.generationId), {status: "failed", updatedAt: new Date(this.now()), leaseToken: null, leaseUntil: null,
        errorCode: String(error.code || "generation-failed"), errorMessage: "Assessment generation failed. Retry this request to resume."});
      tx.delete(this.lock(state.studentId));
    });
  }
  async pause(state, access) {
    await this.getDb().runTransaction(async tx => {
      const job = await this.guard(tx, state); access.assertAccess?.();
      tx.update(this.ref(state.generationId), {status: "queued", updatedAt: new Date(this.now()), leaseToken: null, leaseUntil: null,
        generationRequest: (job.generationRequest || 0) + 1});
      tx.delete(this.lock(state.studentId));
    });
    return {status: "queued", generationId: state.generationId, assessmentId: state.assessmentId};
  }
}
module.exports = {FirestoreSubjectAssessmentGenerationRepository};
