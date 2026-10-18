import * as firebaseOps from "../../../utils/firebase/firebase_ops.js";
import {ESSAY_QUESTION_GENERATOR_COLLECTION, ESSAY_QUESTION_CONFIG_DOCUMENT_ID, ESSAY_QUESTION_INDEX_DOCUMENT_ID} from "../../../config/firebase/essay_question_generator_schema.js?v=20261017-essay-grade-min-words-v1";
import {EssayQuestionGeneratorConfig, normalizeConfiguration, requireAdministratorUid, normalizeWordCountRequirement} from "../domain/essay_question_generator_config.js?v=20261017-essay-grade-min-words-v1";
import {normalizeGenerationInput, normalizeGeneratedQuestion, normalizeQuestionId, questionCollectionPath, scopeFromQuestionPath, readQuestion, normalizeListInput, decodeCursor, encodeCursor} from "../domain/essay_question.js?v=20261017-essay-grade-min-words-v1";
import {EssayQuestionGeneratorRepository} from "../domain/essay_question_generator_repository.js?v=20261017-essay-grade-min-words-v1";


class FirestoreEssayQuestionGeneratorRepository extends EssayQuestionGeneratorRepository {
  constructor({
    readDocument = firebaseOps.readDocument,
    writeDocument = firebaseOps.writeDocument,
    getFirestoreDb = firebaseOps.getFirestoreDb,
    serverTimestamp = () => firebaseOps.getFirebaseNamespace().firestore.FieldValue.serverTimestamp(),
    documentId = () => firebaseOps.getFirebaseNamespace().firestore.FieldPath.documentId(),
  } = {}) {
    super();
    Object.assign(this, {readDocument, writeDocument, getFirestoreDb, serverTimestamp, documentId});
  }
  async getConfig() {
    const data = await this.readDocument(ESSAY_QUESTION_GENERATOR_COLLECTION, ESSAY_QUESTION_CONFIG_DOCUMENT_ID, {includeId: false});
    return data === null ? null : new EssayQuestionGeneratorConfig(data);
  }
  async saveConfig(input, {beforeWrite = () => {}} = {}) {
    const configuration = normalizeConfiguration(input);
    const updatedBy = requireAdministratorUid(input.updatedBy);
    beforeWrite();
    await this.writeDocument(ESSAY_QUESTION_GENERATOR_COLLECTION, ESSAY_QUESTION_CONFIG_DOCUMENT_ID, {
      ...configuration, updatedAt: this.serverTimestamp(), updatedBy,
    }, {merge: false});
    const saved = await this.getConfig();
    if (!saved) throw new Error("Saved essay question configuration could not be read.");
    return saved;
  }
  createQuestionId(criteria) {
    return this.getFirestoreDb().collection(questionCollectionPath(criteria)).doc().id;
  }
  async saveQuestion(input, {beforeWrite = () => {}} = {}) {
    const criteria = normalizeGenerationInput(input);
    const {questionText} = normalizeGeneratedQuestion(input);
    const wordCountRequirement = normalizeWordCountRequirement(input.wordCountRequirement);
    beforeWrite();
    const db = this.getFirestoreDb();
    const reference = db.collection(questionCollectionPath(criteria)).doc(
      input.questionId === undefined ? this.createQuestionId(criteria) : normalizeQuestionId(input.questionId));
    const index = db.collection(ESSAY_QUESTION_GENERATOR_COLLECTION).doc(ESSAY_QUESTION_INDEX_DOCUMENT_ID)
      .collection("entries").doc(reference.id);
    const data = {questionText, difficulty: criteria.difficulty, seedUsed: criteria.seed,
      wordCountRequirement, generatedAt: this.serverTimestamp()};
    await db.runTransaction(async transaction => {
      beforeWrite();
      const existingIndex = await transaction.get(index);
      const existingQuestion = await transaction.get(reference);
      if (existingIndex.exists || existingQuestion.exists) {
        const stored = existingQuestion.data();
        if (input.questionId !== undefined && existingIndex.exists && existingQuestion.exists
            && existingIndex.data().documentPath === reference.path
            && stored.questionText === data.questionText && stored.difficulty === data.difficulty
            && stored.seedUsed === data.seedUsed
            && normalizeWordCountRequirement(stored.wordCountRequirement).minWords === wordCountRequirement.minWords) return;
        throw new Error("The generated essay question ID already exists. Try again.");
      }
      beforeWrite();
      transaction.set(reference, data);
      transaction.set(index, {documentPath: reference.path});
    });
    beforeWrite();
    const saved = await reference.get();
    if (!saved.exists) throw new Error("Saved essay question could not be read.");
    return readQuestion(saved.data(), criteria, reference.id);
  }
  async getQuestionById(questionId) {
    const id = normalizeQuestionId(questionId);
    const db = this.getFirestoreDb();
    const index = await db.collection(ESSAY_QUESTION_GENERATOR_COLLECTION).doc(ESSAY_QUESTION_INDEX_DOCUMENT_ID)
      .collection("entries").doc(id).get();
    if (!index.exists) return null;
    const path = index.data().documentPath;
    const scope = scopeFromQuestionPath(path, id);
    const snapshot = await db.doc(path).get();
    if (!snapshot.exists) throw new Error("The indexed essay question could not be found.");
    return readQuestion(snapshot.data(), scope, id);
  }
  async listQuestions(input) {
    const criteria = normalizeListInput(input);
    const db = this.getFirestoreDb();
    let query = db.collection(questionCollectionPath(criteria));
    if (criteria.difficulty !== undefined) query = query.where("difficulty", "==", criteria.difficulty);
    query = query.orderBy(this.documentId());
    const after = decodeCursor(criteria.cursor, criteria);
    if (after) query = query.startAfter(after);
    const snapshot = await query.limit(criteria.limit + 1).get();
    const questions = snapshot.docs.slice(0, criteria.limit).map(doc => readQuestion(doc.data(), criteria, doc.id));
    return {
      questions,
      nextCursor: snapshot.docs.length > criteria.limit ? encodeCursor(criteria, questions.at(-1).questionId) : null,
    };
  }
}


export {FirestoreEssayQuestionGeneratorRepository};
