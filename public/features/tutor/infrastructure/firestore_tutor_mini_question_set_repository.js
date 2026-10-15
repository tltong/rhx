import * as firebaseOps from "../../../utils/firebase/firebase_ops.js";
import {TUTOR_COLLECTION} from "../../../config/firebase/tutor_schema.js?v=20261015-tutor-count-variants-v1";
import {TutorMiniQuestionSet, normalizeTutorSetVariantReference, normalizeTutorSetInput} from "../domain/tutor_mini_question_set.js?v=20261015-tutor-count-variants-v1";
import {TutorMiniQuestionSetRepository} from "../domain/tutor_mini_question_set_repository.js?v=20261015-tutor-generation-v1";
import {tutorSetDocumentId} from "./tutor_set_document_id.js?v=20261015-tutor-generation-v1";
import {tutorSetPath} from "./tutor_set_path.js?v=20261015-tutor-count-variants-v1";

function toRecord(set) {
  return {...set, miniQuestions: set.miniQuestions.map(question => ({
    ...question, acceptedAnswers: [...question.acceptedAnswers],
  }))};
}

function validateReference(set, reference) {
  if (set.questionId !== reference.questionId || set.language !== reference.language
      || set.miniQuestionCount !== reference.miniQuestionCount) {
    throw new Error("Stored tutor mini question set does not match its question/count/language key.");
  }
  return set;
}

class FirestoreTutorMiniQuestionSetRepository extends TutorMiniQuestionSetRepository {
  constructor({
    readDocument = firebaseOps.readDocument,
    writeDocument = firebaseOps.writeDocument,
    createDocumentIfAbsent = firebaseOps.createDocumentIfAbsent,
    serverTimestamp = () => firebaseOps.getFirebaseNamespace().firestore.FieldValue.serverTimestamp(),
  } = {}) {
    super();
    Object.assign(this, {readDocument, writeDocument, createDocumentIfAbsent, serverTimestamp});
  }

  async get(input, {beforeWrite = () => {}} = {}) {
    const reference = normalizeTutorSetVariantReference(input);
    const {collectionPath, documentId} = tutorSetPath(reference);
    let data = await this.readDocument(collectionPath, documentId, {includeId: false});
    if (data === null) {
      // Read the former question/language hash only on a miss. Copy matching
      // variants without regenerating, changing timestamps or deleting history.
      const legacyId = await tutorSetDocumentId(reference);
      const legacy = await this.readDocument(TUTOR_COLLECTION, legacyId, {includeId: false});
      if (legacy === null) return null;
      const set = new TutorMiniQuestionSet(legacy);
      if (set.questionId !== reference.questionId || set.language !== reference.language) {
        throw new Error("Legacy tutor mini question set does not match its question/language key.");
      }
      if (set.miniQuestionCount !== reference.miniQuestionCount) return null;
      beforeWrite();
      try {
        await this.createDocumentIfAbsent(collectionPath, documentId, toRecord(set));
      } catch (error) {
        // Another request may have already created the new variant.
        if (error.code !== "already-exists" && error.code !== 6) throw error;
      }
      data = await this.readDocument(collectionPath, documentId, {includeId: false});
      if (data === null) throw new Error("Migrated tutor mini question set could not be read.");
    }
    return validateReference(new TutorMiniQuestionSet(data), reference);
  }

  async save(input, {beforeWrite = () => {}} = {}) {
    const normalized = normalizeTutorSetInput(input);
    const {collectionPath, documentId} = tutorSetPath(normalized);
    const data = toRecord({...normalized, generatedAt: this.serverTimestamp()});
    beforeWrite();
    await this.writeDocument(collectionPath, documentId, data, {merge: false});
    // Read only the newly written path: a missing save must not fall back to
    // an old legacy record and report that as a successful generation.
    const saved = await this.readDocument(collectionPath, documentId, {includeId: false});
    if (saved === null) throw new Error("Saved tutor mini question set could not be read.");
    return validateReference(new TutorMiniQuestionSet(saved), normalized);
  }
}

export {FirestoreTutorMiniQuestionSetRepository};
