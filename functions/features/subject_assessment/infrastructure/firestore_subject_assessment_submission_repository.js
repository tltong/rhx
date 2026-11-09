const {getFirestoreDb} = require("../../../utils/firebase/firebase_ops");
const {id, clean, slotId, problem} = require("../domain/subject_assessment");
const {normalizeAnswers, mergeAnswers, revision, requireRevision} = require("../domain/subject_assessment_submission");
const {subjectStateReference} = require("../domain/student_subject_assessment");
const {guardAssessmentCleanup} = require("./subject_assessment_cleanup_guard");

class FirestoreSubjectAssessmentSubmissionRepository {
  constructor({getDb = getFirestoreDb, now = () => Date.now(), uuid = () => globalThis.crypto.randomUUID()} = {}) {Object.assign(this, {getDb, now, uuid});}
  ref(assessmentId) {return this.getDb().collection("subjectAssessmentSubmissions").doc(id(assessmentId, "Assessment ID"));}
  job(assessmentId) {return this.ref(assessmentId).collection("private").doc("marking");}
  result(assessmentId) {return this.getDb().collection("subjectAssessmentResults").doc(id(assessmentId));}
  async getSubmission(assessmentId) {
    return this.getDb().runTransaction(async tx => {
      const ref = this.ref(assessmentId), root = await tx.get(ref);
      if (!root.exists) return null;
      const items = await tx.get(ref.collection("items").orderBy("position"));
      return clean({assessmentId: ref.id, ...root.data(), items: items.docs.map(doc => doc.data())});
    });
  }
  async save(assessment, input, access, {submit = false, settings} = {}) {
    const incoming = normalizeAnswers(assessment, input.answers || []);
    if (incoming.length > 350) throw problem("Save at most 350 item answers per request before submitting.");
    const expected = revision(input), ref = this.ref(assessment.assessmentId);
    return this.getDb().runTransaction(async tx => {
      const paper = await tx.get(this.getDb().collection("subjectAssessments").doc(assessment.assessmentId));
      if (!paper.exists) throw problem("This assessment no longer exists.", "not-found");
      await guardAssessmentCleanup(this.getDb(), tx, assessment.studentId, assessment.syllabusId);
      const saved = await tx.get(ref), previous = saved.data();
      const docs = await tx.get(ref.collection("items").orderBy("position"));
      const stored = docs.docs.map(doc => doc.data());
      const subjectState = submit ? subjectStateReference(this.getDb(), assessment.studentId, assessment.syllabusId) : null;
      if (subjectState) await tx.get(subjectState);
      access.assertAccess?.();
      if (previous?.status === "submitted") {
        if (submit) return clean({assessmentId: ref.id, ...previous, items: stored});
        throw problem("Submitted assessment answers are locked.", "failed-precondition");
      }
      requireRevision(previous, expected);
      const merged = mergeAnswers(stored, incoming);
      // Validate all stored answers before locking; missing answers are zero-mark responses.
      normalizeAnswers(assessment, merged, {final: submit});
      const now = new Date(this.now()), startedAt = previous?.startedAt || now;
      const data = clean({studentId: assessment.studentId, syllabusId: assessment.syllabusId, language: assessment.language,
        status: submit ? "submitted" : "draft", revision: expected + 1, startedAt, updatedAt: now,
        submittedAt: submit ? now : null, timeTakenSeconds: submit ? Math.max(0, Math.floor((+now - +clean(startedAt)) / 1000)) : null,
        itemCount: assessment.items.length, markingStatus: submit ? "pending" : "notStarted", markingRequest: submit ? 1 : 0,
        markedItemCount: 0, errorMessage: null});
      tx.set(ref, data);
      for (const item of incoming) tx.set(ref.collection("items").doc(slotId(item.position)), item);
      if (submit) tx.create(this.job(ref.id), {settings: clean(settings), leaseToken: null, leaseUntil: null});
      if (submit) tx.set(subjectState, {studentId: assessment.studentId, syllabusId: assessment.syllabusId, activeGenerationId: null,
        lastSubmittedAt: now, lastSubmittedAssessmentId: ref.id, updatedAt: now}, {merge: true});
      return clean({assessmentId: ref.id, ...data, items: submit ? normalizeAnswers(assessment, merged, {final: true}) : merged});
    });
  }
  async retry(assessmentId, access) {
    const ref = this.ref(assessmentId);
    await this.getDb().runTransaction(async tx => {
      const root = await tx.get(ref), job = await tx.get(this.job(assessmentId)), data = root.data();
      if (data) await guardAssessmentCleanup(this.getDb(), tx, data.studentId, data.syllabusId);
      access.assertAccess?.();
      if (data?.status !== "submitted") throw problem("Submit this assessment before retrying marking.", "failed-precondition");
      if (data.markingStatus === "completed") return;
      const active = job.data()?.leaseUntil?.toMillis() > this.now();
      const recent = data.updatedAt?.toMillis() > this.now() - 4 * 60 * 1000;
      if (active || (data.markingStatus !== "failed" && recent)) return;
      tx.update(ref, {markingStatus: "pending", markingRequest: data.markingRequest + 1, updatedAt: new Date(this.now()), errorMessage: null});
      tx.set(this.job(assessmentId), {leaseToken: null, leaseUntil: null}, {merge: true});
    });
    return this.getSubmission(assessmentId);
  }
  async claimMarking(assessmentId, requested) {
    const ref = this.ref(assessmentId), token = this.uuid();
    return this.getDb().runTransaction(async tx => {
      const root = await tx.get(ref), job = await tx.get(this.job(assessmentId)), data = root.data();
      if (data) await guardAssessmentCleanup(this.getDb(), tx, data.studentId, data.syllabusId);
      if (data?.status !== "submitted" || ["completed", "failed"].includes(data.markingStatus) || (requested !== undefined && requested !== data.markingRequest)) return null;
      if (job.data()?.leaseUntil?.toMillis() > this.now()) throw problem("Assessment marking is already running.", "marking-in-progress");
      const answers = await tx.get(ref.collection("items").orderBy("position"));
      tx.set(this.job(assessmentId), {leaseToken: token, leaseUntil: new Date(this.now() + 4 * 60 * 1000)}, {merge: true});
      tx.update(ref, {markingStatus: "marking", updatedAt: new Date(this.now()), errorMessage: null});
      return clean({assessmentId, leaseToken: token, markingRequest: data.markingRequest, settings: job.data()?.settings,
        submission: {...data, items: answers.docs.map(doc => doc.data())}});
    });
  }
  async guard(tx, state) {
    await guardAssessmentCleanup(this.getDb(), tx, state.submission.studentId, state.submission.syllabusId);
    const root = await tx.get(this.ref(state.assessmentId)), job = await tx.get(this.job(state.assessmentId));
    if (root.data()?.markingRequest !== state.markingRequest || root.data()?.markingStatus !== "marking" || job.data()?.leaseToken !== state.leaseToken) {
      throw problem("This marking worker was replaced.", "marking-lease-lost");
    }
    return {root: root.data(), job: job.data()};
  }
  async renew(state) {
    await this.getDb().runTransaction(async tx => {
      await this.guard(tx, state);
      tx.update(this.job(state.assessmentId), {leaseUntil: new Date(this.now() + 4 * 60 * 1000)});
      tx.update(this.ref(state.assessmentId), {updatedAt: new Date(this.now())});
    });
  }
  async freezeMarkingSettings(state, settings) {
    return this.getDb().runTransaction(async tx => {
      const saved = await this.guard(tx, state);
      if (saved.job.settings) return clean(saved.job.settings);
      tx.update(this.job(state.assessmentId), {settings: clean(settings)});
      return settings;
    });
  }
  async markedItem(state, position) {
    const saved = await this.job(state.assessmentId).collection("items").doc(slotId(position)).get();
    return saved.exists ? clean(saved.data()) : null;
  }
  async saveMarkedItem(state, item) {
    await this.getDb().runTransaction(async tx => {
      const saved = await this.guard(tx, state), ref = this.job(state.assessmentId).collection("items").doc(slotId(item.position));
      const previous = await tx.get(ref);
      if (previous.exists) return;
      tx.create(ref, clean(item));
      tx.update(this.ref(state.assessmentId), {markedItemCount: saved.root.markedItemCount + 1, updatedAt: new Date(this.now())});
      tx.update(this.job(state.assessmentId), {leaseUntil: new Date(this.now() + 4 * 60 * 1000)});
    });
  }
  async queueContinuation(state) {
    await this.getDb().runTransaction(async tx => {
      const saved = await this.guard(tx, state);
      tx.update(this.ref(state.assessmentId), {markingStatus: "pending", markingRequest: saved.root.markingRequest + 1, updatedAt: new Date(this.now())});
      tx.update(this.job(state.assessmentId), {leaseToken: null, leaseUntil: null});
    });
    return {queued: true};
  }
  async publishResult(state, items, summary) {
    const ref = this.result(state.assessmentId);
    for (let offset = 0; offset < items.length; offset += 100) await this.getDb().runTransaction(async tx => {
      await this.guard(tx, state);
      for (const item of items.slice(offset, offset + 100)) tx.set(ref.collection("items").doc(slotId(item.position)), clean(item));
      tx.update(this.job(state.assessmentId), {leaseUntil: new Date(this.now() + 4 * 60 * 1000)});
    });
    const result = await this.getDb().runTransaction(async tx => {
      const saved = await this.guard(tx, state), previous = await tx.get(ref);
      if (previous.exists) throw problem("This result was already published.", "already-exists");
      const data = clean({studentId: state.submission.studentId, syllabusId: state.submission.syllabusId, language: state.submission.language,
        submittedAt: state.submission.submittedAt, timeTakenSeconds: state.submission.timeTakenSeconds, scoredAt: new Date(this.now()), ...summary});
      if (saved.root.markedItemCount !== items.length) throw problem("Marking is incomplete.", "failed-precondition");
      tx.create(ref, data);
      tx.update(this.ref(state.assessmentId), {markingStatus: "completed", updatedAt: data.scoredAt, errorMessage: null});
      tx.update(this.job(state.assessmentId), {leaseToken: null, leaseUntil: null, completedAt: data.scoredAt});
      return clean({assessmentId: ref.id, ...data, items});
    });
    return result;
  }
  async failMarking(state, error) {
    await this.getDb().runTransaction(async tx => {
      await this.guard(tx, state);
      tx.update(this.ref(state.assessmentId), {markingStatus: "failed", updatedAt: new Date(this.now()), errorMessage: "Marking could not finish. Retry to resume your saved submission."});
      tx.update(this.job(state.assessmentId), {leaseToken: null, leaseUntil: null, errorCode: String(error.code || "marking-failed").slice(0, 100)});
    });
  }
}
module.exports = {FirestoreSubjectAssessmentSubmissionRepository};
