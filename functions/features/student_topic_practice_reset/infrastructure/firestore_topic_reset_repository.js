const {FieldValue} = require("firebase-admin/firestore");
const firebaseOps = require("../../../utils/firebase/firebase_ops");
const {identifier, resetScope, topicKey, resetError} = require("../domain/reset_scope");
const LEASE_MS = 10 * 60 * 1000;
const CHUNK_SIZE = 150;

class FirestoreTopicResetRepository {
  constructor({getFirestoreDb = firebaseOps.getFirestoreDb, now = () => Date.now(), serverTimestamp = () => FieldValue.serverTimestamp()} = {}) {
    Object.assign(this, {getFirestoreDb, now, serverTimestamp});
  }
  root(studentId) {return this.getFirestoreDb().collection("studentPracticeResets").doc(studentId);}
  job(studentId, resetId) {return this.root(studentId).collection("requests").doc(resetId);}
  async getStatus({studentId, resetId}) {
    identifier(studentId, "studentId"); identifier(resetId, "resetId");
    const snapshot = await this.job(studentId, resetId).get();
    if (!snapshot.exists) return null;
    const {leaseToken, ...data} = snapshot.data();
    for (const field of ["leaseUntil", "updatedAt"]) if (typeof data[field]?.toDate === "function") data[field] = data[field].toDate();
    return {...data, studentId, resetId};
  }
  async getActive(studentId) {
    const root = await this.root(studentId).get();
    const resetId = root.data()?.activeResetId;
    return resetId ? this.getStatus({studentId, resetId}) : null;
  }
  async claim(input, requestedBy) {
    const scope = resetScope(input), resetId = identifier(input.resetId, "resetId");
    const db = this.getFirestoreDb(), root = this.root(scope.studentId), job = this.job(scope.studentId, resetId);
    const token = job.collection("steps").doc().id;
    return db.runTransaction(async tx => {
      const [rootSnapshot, jobSnapshot] = await Promise.all([tx.get(root), tx.get(job)]);
      const state = rootSnapshot.data() ?? {}, previous = jobSnapshot.data();
      if (previous && (previous.syllabusId !== scope.syllabusId || previous.topicId !== scope.topicId)) throw resetError("already-exists", "This reset ID belongs to another topic.");
      if (previous?.status === "completed") return {resetId, ...previous};
      if (state.activeResetId && state.activeResetId !== resetId) throw resetError("reset-in-progress", "Finish or resume the student's existing reset first.");
      const until = previous?.leaseUntil?.toDate?.() ?? previous?.leaseUntil;
      if (previous?.status === "running" && until instanceof Date && until.getTime() > this.now()) throw resetError("reset-in-progress", "This topic reset is already running.");
      const key = topicKey(scope), timestamp = this.serverTimestamp();
      const marker = previous ? state.topics?.[key] : {revision: (state.topics?.[key]?.revision ?? 0) + 1, resetAt: timestamp};
      if (!marker) throw resetError("failed-precondition", "The reset marker is missing.");
      tx.set(root, {...state, activeResetId: resetId, activeTopicKey: key, topics: {...state.topics, [key]: marker}});
      const record = {...previous, syllabusId: scope.syllabusId, topicId: scope.topicId, requestedBy: previous?.requestedBy ?? requestedBy,
        status: "running", stage: previous?.stage ?? "planning", leaseToken: token, leaseUntil: new Date(this.now() + LEASE_MS),
        deletedCounts: previous?.deletedCounts ?? {}, updatedAt: timestamp, error: null};
      tx.set(job, record);
      return {resetId, ...record};
    });
  }
  async owned(tx, input, token) {
    const root = this.root(input.studentId), job = this.job(input.studentId, input.resetId);
    const [rootSnapshot, jobSnapshot] = await Promise.all([tx.get(root), tx.get(job)]);
    const state = jobSnapshot.data();
    if (rootSnapshot.data()?.activeResetId !== input.resetId || state?.leaseToken !== token || state.status !== "running") {
      throw resetError("reset-lease-lost", "Another request has resumed this reset.");
    }
    return {root, job, state, rootData: rootSnapshot.data()};
  }
  async savePlan(input, token, plan) {
    const job = this.job(input.studentId, input.resetId), chunks = [];
    for (let index = 0; index < plan.operations.length; index += CHUNK_SIZE) chunks.push(plan.operations.slice(index, index + CHUNK_SIZE));
    for (let index = 0; index < chunks.length; index++) {
      await this.getFirestoreDb().runTransaction(async tx => {
        await this.owned(tx, input, token);
        tx.set(job.collection("steps").doc(String(index).padStart(6, "0")), {done: false, operations: chunks[index]});
      });
    }
    await this.getFirestoreDb().runTransaction(async tx => {
      const {state} = await this.owned(tx, input, token);
      tx.set(job, {...state, stage: "deleting", totalSteps: chunks.length, plannedCounts: plan.counts,
        protectedEssayResults: plan.protectedEssayResults, warnings: plan.warnings, updatedAt: this.serverTimestamp()});
    });
  }
  validateOperation(operation, input) {
    const {studentId, syllabusId, topicId} = resetScope(input), path = operation.path;
    if (typeof path !== "string") throw resetError("failed-precondition", "The reset plan contains an invalid student record path.");
    const prefixes = [
      `studentPractices/${studentId}/assignedPractices/`, `studentPractices/${studentId}/completedPractices/`, `studentPractices/${studentId}/completionProcessing/`,
      `studentEssayPractices/${studentId}/assignedEssayPractices/`, `studentEssayPractices/${studentId}/completedEssayPractices/`,
      `studentEssayPractices/${studentId}/questionUsage/`,
      `essayResults/${studentId}/questions/`, `studentEssayPracticeGenerations/${studentId}/completions/`,
      `studentAssessmentProgress/${studentId}/practiceAssessments/`,
      `studentReadiness/${studentId}/syllabuses/${syllabusId}/history/`,
      ...["studentAssessmentProgress", "studentReadiness", "reliability"].map(collection => `${collection}/${studentId}/syllabuses/${syllabusId}/topics/${topicId}`),
    ];
    const missionRoot = `studentDailyMissions/${studentId}/`, parts = typeof path === "string" ? path.split("/") : [];
    const below = prefix => path === prefix || path.startsWith(prefix + "/");
    const missionSubject = parts.length >= 6 && parts[0] === "studentDailyMissions" && parts[1] === studentId
      && parts[2] === "days" && parts[4] === "syllabuses" && parts[5] === syllabusId;
    const missionRecord = ["acceptedDailyMissionPractices", "acceptedDailyMissionEssays", "acceptedAdditionalMissionPractices", "acceptedAdditionalMissionEssays"]
      .some(kind => parts.length === 4 && path.startsWith(missionRoot + kind + "/"))
      || ["pausedTopics", "missionStats"].some(kind => below(`${missionRoot}${kind}/${syllabusId}/topics/${topicId}`))
      || missionSubject && ["coreTopics", "additionalTopics"].includes(parts[6]) && parts[7] === topicId;
    const coreMission = operation.kind === "clearCoreMission" && missionSubject && parts.length === 6;
    const practiceResult = parts.length >= 4 && parts[0] === "practiceResults" && parts[2] === "studentSubmissions" && parts[3] === studentId;
    if (typeof path !== "string" || path.split("/").some(part => !part || [".", ".."].includes(part))
        || path.split("/").length % 2 !== 0 || !["delete", "clearCoreMission"].includes(operation.kind)
        || !(operation.kind === "delete" && (prefixes.some(prefix => prefix.endsWith("/") ? path.startsWith(prefix) : below(prefix)) || missionRecord || practiceResult) || coreMission)) {
      throw resetError("failed-precondition", "The reset plan contains an invalid student record path.");
    }
  }
  async deleteStep(input, token, index) {
    const step = this.job(input.studentId, input.resetId).collection("steps").doc(String(index).padStart(6, "0"));
    await this.getFirestoreDb().runTransaction(async tx => {
      const {job, state} = await this.owned(tx, input, token), snapshot = await tx.get(step);
      if (!snapshot.exists) throw new Error("A reset plan step is missing.");
      const plan = snapshot.data();
      if (plan.done) return;
      const patches = new Map();
      for (const operation of plan.operations) {
        this.validateOperation(operation, input);
        if (operation.kind === "clearCoreMission") patches.set(operation.path, await tx.get(this.getFirestoreDb().doc(operation.path)));
      }
      const deletedCounts = {...state.deletedCounts};
      for (const operation of plan.operations) {
        const ref = this.getFirestoreDb().doc(operation.path);
        if (operation.kind === "clearCoreMission") {
          const saved = patches.get(operation.path);
          if (saved.exists && saved.data().coreMission?.topicId === input.topicId) {
            const {coreMission, ...remaining} = saved.data();
            tx.set(ref, remaining);
          }
        } else tx.delete(ref);
        deletedCounts[operation.category] = (deletedCounts[operation.category] ?? 0) + 1;
      }
      tx.set(step, {done: true});
      tx.set(job, {...state, deletedCounts, updatedAt: this.serverTimestamp(), leaseUntil: new Date(this.now() + LEASE_MS)});
    });
  }
  async markRecalculating(input, token) {
    await this.getFirestoreDb().runTransaction(async tx => {
      const {job, state} = await this.owned(tx, input, token);
      tx.set(job, {...state, stage: "recalculating", updatedAt: this.serverTimestamp(), leaseUntil: new Date(this.now() + LEASE_MS)});
    });
  }
  async finish(input, token, {readiness, reliability}) {
    await this.getFirestoreDb().runTransaction(async tx => {
      const {root, job, state, rootData} = await this.owned(tx, input, token);
      const db = this.getFirestoreDb(), timestamp = this.serverTimestamp();
      const readinessRef = db.doc(`studentReadiness/${input.studentId}/syllabuses/${input.syllabusId}`);
      const reliabilityRef = db.doc(`reliability/${input.studentId}/syllabuses/${input.syllabusId}`);
      if (readiness === null) tx.delete(readinessRef);
      else {
        tx.set(readinessRef, {score: readiness, updatedAt: timestamp}, {merge: true});
        tx.set(readinessRef.collection("history").doc("topic-reset-" + input.resetId), {score: readiness, savedAt: timestamp, resetId: input.resetId});
      }
      if (reliability === null) tx.delete(reliabilityRef);
      else tx.set(reliabilityRef, {score: reliability, updatedAt: timestamp}, {merge: true});
      const {leaseToken, leaseUntil, ...record} = state;
      tx.set(job, {...record, status: "completed", stage: "completed", updatedAt: timestamp, subjectReadiness: readiness, subjectReliability: reliability, error: null});
      tx.set(root, {...rootData, activeResetId: null, activeTopicKey: null, lastResetId: input.resetId});
    });
  }
  async fail(input, token, error) {
    await this.getFirestoreDb().runTransaction(async tx => {
      const {job, state} = await this.owned(tx, input, token);
      tx.set(job, {...state, status: "failed", error: String(error.message ?? error).slice(0, 500), updatedAt: this.serverTimestamp()});
    });
  }
}
module.exports = {FirestoreTopicResetRepository};
