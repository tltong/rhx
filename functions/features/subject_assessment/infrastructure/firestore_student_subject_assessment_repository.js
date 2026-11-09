const {getFirestoreDb} = require("../../../utils/firebase/firebase_ops");
const {sourceKey, id, clean, problem} = require("../domain/subject_assessment");
const {subjectStateReference, subscriptionKey, generationView, subjectOverview} = require("../domain/student_subject_assessment");
const {requireConfigurationInput, requireRepeatPolicy, requireSettingsInput, resolveAllocations} = require("../../subject_assessment_config/domain/subject_assessment_config");
const {FirestoreSubjectAssessmentConfigRepository} = require("../../subject_assessment_config/infrastructure/firestore_subject_assessment_config_repository");
const {guardAssessmentCleanup} = require("./subject_assessment_cleanup_guard");

class FirestoreStudentSubjectAssessmentRepository {
  constructor({getDb = getFirestoreDb, now = () => Date.now(), uuid = () => globalThis.crypto.randomUUID(), configurations = new FirestoreSubjectAssessmentConfigRepository({getDb})} = {}) {
    Object.assign(this, {getDb, now, uuid, configurations});
  }
  state(studentId, syllabusId) {return subjectStateReference(this.getDb(), studentId, syllabusId);}
  job(generationId) {return this.getDb().collection("subjectAssessmentGenerations").doc(id(generationId));}
  subscription(studentId, syllabusId) {return this.getDb().collection("syllabusSubscriptions").doc(studentId).collection("syllabuses").doc(syllabusId);}
  async validateSubscription(job) {
    const saved = await this.subscription(job.studentId, job.syllabusId).get();
    if (saved.data()?.state !== "active") throw problem("The subject subscription is no longer active.", "permission-denied");
    if (job.subscriptionKey && subscriptionKey(saved) !== job.subscriptionKey) throw problem("This subscription was replaced.", "generation-request-superseded");
  }
  async getJob(generationId, transaction) {const ref = this.job(generationId), saved = await (transaction ? transaction.get(ref) : ref.get()); return saved.exists ? clean({generationId: saved.id, ...saved.data()}) : null;}
  async records(collection, studentId, {syllabusId, transaction} = {}) {
    let base = this.getDb().collection(collection).where("studentId", "==", studentId).orderBy("__name__");
    if (syllabusId) base = base.where("syllabusId", "==", syllabusId);
    const items = []; let after = null;
    do {
      let query = base.limit(200); if (after) query = query.startAfter(after);
      const page = await (transaction ? transaction.get(query) : query.get());
      items.push(...page.docs.map(doc => clean({assessmentId: doc.id, ...doc.data()})));
      after = page.size === 200 ? page.docs.at(-1) : null;
    } while (after);
    return items;
  }
  async isActive(job) {return (await this.state(job.studentId, job.syllabusId).get()).data()?.activeGenerationId === job.generationId;}
  async subscribedSubjects(studentId, scopes) {
    const active = await this.getDb().collection("syllabusSubscriptions").doc(studentId).collection("syllabuses").where("state", "==", "active").get();
    const subscriptions = new Map(active.docs.map(doc => [doc.id, doc.data()]));
    return scopes.filter(scope => subscriptions.has(scope.syllabusId)).map(scope => ({...scope, language: subscriptions.get(scope.syllabusId).language || scope.language}));
  }
  async overview(studentId, scopes) {
    return this.getDb().runTransaction(async transaction => {
    const [settingsDoc, assessments, submissions, results] = await Promise.all([
      transaction.get(this.configurations.settingsReference()), this.records("subjectAssessments", studentId, {transaction}),
      this.records("subjectAssessmentSubmissions", studentId, {transaction}), this.records("subjectAssessmentResults", studentId, {transaction}),
    ]);
    const settings = settingsDoc.data();
    const subjects = await Promise.all(scopes.map(async scope => {
      const [configDoc, state] = await Promise.all([transaction.get(this.configurations.reference(scope)), transaction.get(this.state(studentId, scope.syllabusId))]);
      const configuration = configDoc.data();
      let configured = false;
      if (configuration) {
        try {
          requireConfigurationInput({...configuration, expectedVersion: configuration.version});
          resolveAllocations(configuration.topics, (await this.configurations.options(scope, transaction, configuration.topics.map(topic => topic.topicId))).topics); configured = true;
        } catch (error) {if (!["invalid-argument", "failed-precondition", "not-found"].includes(error.code)) throw error;}
      }
      const generation = state.data()?.activeGenerationId ? await this.getJob(state.data().activeGenerationId, transaction) : null;
      if (generation && (generation.studentId !== studentId || generation.syllabusId !== scope.syllabusId)) throw problem("Assessment progress is inconsistent.", "failed-precondition");
      return subjectOverview({scope, configured, settings, assessments, submissions, results, generation, now: this.now()});
    }));
    let policy = {repeatMode: null, intervalDays: null};
    try {policy = requireRepeatPolicy(settings);} catch (_) {}
    return clean({...policy, subjects});
    });
  }
  async start(studentId, scope, requestId, access, {automatic = false, subscriptionKey: expectedSubscription} = {}) {
    const generationId = "student-" + await sourceKey(JSON.stringify([studentId, requestId])), requestRef = this.job(generationId), stateRef = this.state(studentId, scope.syllabusId);
    return this.getDb().runTransaction(async tx => {
      const subscription = await tx.get(this.subscription(studentId, scope.syllabusId));
      if (automatic && (subscription.data()?.state !== "active" || subscriptionKey(subscription) !== expectedSubscription)) {
        return {status: "skipped", reason: "subscriptionUnavailable"};
      }
      await guardAssessmentCleanup(this.getDb(), tx, studentId, scope.syllabusId);
      if (subscription.data()?.state !== "active") throw problem("This subject subscription is no longer active.", "permission-denied");
      if (subscription.data().language && subscription.data().language.trim().toLowerCase() !== scope.language?.trim().toLowerCase()) {
        throw problem("The subscription language changed. Refresh before starting the assessment.", "aborted");
      }
      const [stateDoc, requested, settingsDoc, configDoc, assessments, submissions] = await Promise.all([
        tx.get(stateRef), tx.get(requestRef), tx.get(this.configurations.settingsReference()), tx.get(this.configurations.reference(scope)),
        this.records("subjectAssessments", studentId, {syllabusId: scope.syllabusId, transaction: tx}),
        this.records("subjectAssessmentSubmissions", studentId, {syllabusId: scope.syllabusId, transaction: tx}),
      ]);
      const prior = requested.data(), state = stateDoc.data(), configuration = configDoc.data();
      if (prior && (prior.studentId !== studentId || prior.syllabusId !== scope.syllabusId)) throw problem("This request ID belongs to another subject.", "already-exists");
      if (prior?.status === "completed") return {status: "ready", assessmentId: prior.assessmentId, generationId};
      const activeDoc = state?.activeGenerationId ? await tx.get(this.job(state.activeGenerationId)) : null;
      const active = activeDoc?.exists ? clean({generationId: activeDoc.id, ...activeDoc.data()}) : null;
      const snapshot = subjectOverview({scope, configured: !!configuration, settings: settingsDoc.data(), assessments, submissions, results: [], generation: active, now: this.now()});
      access.assertAccess?.();
      if (snapshot.activeAssessment) return {status: "ready", assessmentId: snapshot.activeAssessment.assessmentId};
      if (active && active.status !== "completed") {
        if (active.studentId !== studentId || active.syllabusId !== scope.syllabusId) throw problem("Assessment progress is inconsistent.", "failed-precondition");
        const view = generationView(active, this.now());
        if (view.canRetry && !automatic) tx.update(activeDoc.ref, {status: "queued", generationRequest: (active.generationRequest || 0) + 1,
          leaseToken: null, leaseUntil: null, updatedAt: new Date(this.now()), errorCode: null, errorMessage: null});
        return {status: "generating", generationId: active.generationId, requestId: active.clientRequestId};
      }
      if (automatic && submissions.some(item => item.status === "submitted")) return {status: "skipped", reason: "alreadyAssessed"};
      if (prior) throw problem("This preparation request is no longer active. Refresh before starting again.", "failed-precondition");
      if (automatic && !snapshot.canStart) return {status: "skipped", reason: snapshot.reason};
      if (snapshot.reason === "noRepeat") throw problem("Repeat assessments are disabled. Only the initial assessment is allowed.", "failed-precondition");
      if (!snapshot.canStart) throw problem(snapshot.reason === "cooldown" ? "Your next assessment is available on " + snapshot.nextAvailableAt.toISOString() + "." : "Subject assessment is not configured yet.", "failed-precondition");
      let options, topics;
      try {
        requireSettingsInput({repeatMode: settingsDoc.data().repeatMode, intervalDays: settingsDoc.data().intervalDays, expectedVersion: settingsDoc.data().version});
        requireConfigurationInput({...configuration, expectedVersion: configuration.version});
        options = await this.configurations.options(scope, tx, configuration.topics.map(topic => topic.topicId));
        topics = resolveAllocations(configuration.topics, options.topics);
      } catch (error) {
        if (automatic && ["invalid-argument", "failed-precondition", "not-found"].includes(error.code)) return {status: "skipped", reason: "subjectNotConfigured"};
        throw error;
      }
      const now = new Date(this.now());
      const syllabus = await tx.get(this.getDb().collection("syllabuses").doc(scope.syllabusId));
      access.assertAccess?.();
      tx.create(requestRef, clean({studentId, syllabusId: scope.syllabusId, language: options.language, assessmentId: this.uuid(), entryPoint: "student",
        origin: automatic ? "subscription" : "student", subscriptionKey: subscriptionKey(subscription),
        clientRequestId: requestId, generationRequest: 1, status: "queued", createdBy: studentId, requestedAt: now, updatedAt: now,
        configurationSnapshot: {...configuration, topics}, contextSnapshot: {level: syllabus.data().level.toLowerCase(), grade: syllabus.data().year,
          subject: syllabus.data().subject, country: syllabus.data().country}, progress: {prepared: 0, total: topics.reduce((sum, topic) => sum + topic.totalCount, 0), reused: 0, generated: 0},
        leaseToken: null, leaseUntil: null}));
      tx.set(stateRef, {studentId, syllabusId: scope.syllabusId, activeGenerationId: generationId, updatedAt: now}, {merge: true});
      return {status: "generating", generationId, requestId};
    });
  }
  async reject(generationId, requestNumber, error) {
    await this.getDb().runTransaction(async tx => {
      const ref = this.job(generationId), saved = await tx.get(ref), data = saved.data();
      if (!data || data.generationRequest !== requestNumber || data.status === "completed" || data.leaseUntil?.toMillis() > this.now()) return;
      tx.update(ref, {status: "failed", updatedAt: new Date(this.now()), leaseToken: null, leaseUntil: null,
        errorCode: String(error.code || "generation-failed").slice(0, 100), errorMessage: "Assessment preparation could not finish. Retry to resume."});
    });
  }
}
module.exports = {FirestoreStudentSubjectAssessmentRepository};
