
import * as firebaseOps from "../../../utils/firebase/firebase_ops.js";
import {guardStudentMaintenance} from "../../../utils/student_topic_reset_guard.js?v=20261018-topic-reset-v1";
import {STUDENT_ESSAY_PRACTICE_GENERATIONS_COLLECTION, ESSAY_FOLLOW_UP_GENERATIONS_SUBCOLLECTION} from "../../../config/firebase/student_essay_practice_generator_schema.js?v=20261018-essay-reuse-v1";
import {GENERATION_LEASE_MILLISECONDS} from "../config/student_essay_practice_generator_config.js?v=20261018-essay-reuse-v1";
import {normalizeGenerationRequest, requireIdentifier, generationError} from "../domain/essay_generation.js?v=20261018-next-essay-v1";

class FirestoreEssayGenerationRepository {
  constructor({getFirestoreDb = firebaseOps.getFirestoreDb, serverTimestamp = () => firebaseOps.getFirebaseNamespace().firestore.FieldValue.serverTimestamp(),
    now = () => Date.now()} = {}) {
    Object.assign(this, {getFirestoreDb, serverTimestamp, now});
  }

  collection(studentId) {
    return this.getFirestoreDb().collection(STUDENT_ESSAY_PRACTICE_GENERATIONS_COLLECTION).doc(studentId)
      .collection(ESSAY_FOLLOW_UP_GENERATIONS_SUBCOLLECTION);
  }

  async guardSource(transaction, request, sourceCompletion) {
    if (!sourceCompletion) return;
    const db = this.getFirestoreDb();
    await guardStudentMaintenance(transaction, db.collection("studentPracticeResets").doc(request.studentId));
    const source = await transaction.get(db.collection("studentEssayPractices").doc(request.studentId)
      .collection("completedEssayPractices").doc(request.completedEssayPracticeId));
    const data = source.data(), completedAt = data?.completedAt?.toDate?.() ?? data?.completedAt;
    if (!source.exists || !(completedAt instanceof Date) || completedAt.getTime() !== sourceCompletion.completedAt.getTime()
        || data.syllabusId !== sourceCompletion.syllabusId || data.topicId !== sourceCompletion.topicId) {
      throw generationError("topic-practice-reset", "The source essay was removed or reset.");
    }
  }

  async claim(input, {assertAccess = () => {}, sourceCompletion} = {}) {
    const request = normalizeGenerationRequest(input);
    assertAccess();
    const collection = this.collection(request.studentId), ref = collection.doc(request.completedEssayPracticeId);
    const leaseToken = collection.doc().id, nextEssayPracticeId = collection.doc().id;
    return this.getFirestoreDb().runTransaction(async transaction => {
      await this.guardSource(transaction, request, sourceCompletion);
      const snapshot = await transaction.get(ref), existing = snapshot.exists ? snapshot.data() : null;
      assertAccess();
      if (existing) {
        requireIdentifier(existing.nextEssayPracticeId, "nextEssayPracticeId");
        if (!["generating", "completed", "failed"].includes(existing.status)) throw new Error("Invalid stored essay generation status.");
        if (existing.status === "completed") return existing;
        const leaseUntil = existing.leaseUntil?.toDate?.() ?? existing.leaseUntil;
        if (existing.status === "generating" && leaseUntil instanceof Date && leaseUntil.getTime() > this.now()) {
          throw generationError("essay-generation-in-progress", "The next essay is already being generated. Try again after it finishes.");
        }
      }
      const state = {status: "generating", nextEssayPracticeId: existing?.nextEssayPracticeId ?? nextEssayPracticeId,
        ...(existing?.draft ? {draft: existing.draft} : {}),
        ...(existing?.reusedQuestionId ? {reusedQuestionId: existing.reusedQuestionId} : {}), leaseToken,
        leaseUntil: new Date(this.now() + GENERATION_LEASE_MILLISECONDS), updatedAt: this.serverTimestamp()};
      transaction.set(ref, state);
      return state;
    });
  }

  async updateOwned(input, leaseToken, transform, {assertAccess = () => {}, sourceCompletion} = {}) {
    const request = normalizeGenerationRequest(input);
    assertAccess();
    const ref = this.collection(request.studentId).doc(request.completedEssayPracticeId);
    return this.getFirestoreDb().runTransaction(async transaction => {
      await this.guardSource(transaction, request, sourceCompletion);
      const snapshot = await transaction.get(ref), state = snapshot.exists ? snapshot.data() : null;
      assertAccess();
      if (!state || state.status !== "generating" || state.leaseToken !== leaseToken) {
        throw generationError("essay-generation-lease-lost", "This essay generation attempt was replaced. Retry the request.");
      }
      const updated = {...transform(state), updatedAt: this.serverTimestamp()};
      transaction.set(ref, updated);
      return updated;
    });
  }

  async saveDraft(input, leaseToken, draft, context) {
    return this.updateOwned(input, leaseToken, state => {
      const {reusedQuestionId, ...rest} = state;
      return {...rest, draft};
    }, context);
  }

  async saveReusedQuestion(input, leaseToken, reusedQuestionId, context) {
    requireIdentifier(reusedQuestionId, "reusedQuestionId");
    return this.updateOwned(input, leaseToken, state => {
      const {draft, ...rest} = state;
      return {...rest, reusedQuestionId};
    }, context);
  }

  async clearSelection(input, leaseToken, context) {
    return this.updateOwned(input, leaseToken, state => {
      const {draft, reusedQuestionId, ...rest} = state;
      return rest;
    }, context);
  }

  async finish(input, leaseToken, essayQuestionId, context) {
    requireIdentifier(essayQuestionId, "essayQuestionId");
    return this.updateOwned(input, leaseToken, state => {
      if ((state.reusedQuestionId ?? state.draft?.questionId) !== essayQuestionId) throw new Error("The essay assignment does not match its saved question selection.");
      return {status: "completed", nextEssayPracticeId: state.nextEssayPracticeId, essayQuestionId};
    }, context);
  }

  async fail(input, leaseToken, context) {
    return this.updateOwned(input, leaseToken, state => ({status: "failed", nextEssayPracticeId: state.nextEssayPracticeId,
      ...(state.draft ? {draft: state.draft} : {}),
      ...(state.reusedQuestionId ? {reusedQuestionId: state.reusedQuestionId} : {})}), context);
  }
}

export {FirestoreEssayGenerationRepository};
