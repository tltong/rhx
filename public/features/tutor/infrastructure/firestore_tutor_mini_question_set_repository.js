import * as firebaseOps from "../../../utils/firebase/firebase_ops.js";
import {TUTOR_COLLECTION} from "../../../config/firebase/tutor_schema.js?v=20261015-tutor-generation-v1";
import {TutorMiniQuestionSet, normalizeTutorSetReference, normalizeTutorSetInput} from "../domain/tutor_mini_question_set.js?v=20261015-tutor-generation-v1";
import {TutorMiniQuestionSetRepository} from "../domain/tutor_mini_question_set_repository.js?v=20261015-tutor-generation-v1";
import {tutorSetDocumentId} from "./tutor_set_document_id.js?v=20261015-tutor-generation-v1";

class FirestoreTutorMiniQuestionSetRepository extends TutorMiniQuestionSetRepository {
  constructor({
    readDocument = firebaseOps.readDocument,
    writeDocument = firebaseOps.writeDocument,
    serverTimestamp = () => firebaseOps.getFirebaseNamespace().firestore.FieldValue.serverTimestamp(),
  } = {}) {
    super();
    Object.assign(this, {readDocument, writeDocument, serverTimestamp});
  }

  async get(input) {
    const reference = normalizeTutorSetReference(input);
    const documentId = await tutorSetDocumentId(reference);
    const data = await this.readDocument(TUTOR_COLLECTION, documentId, {includeId: false});
    if (data === null) return null;
    const set = new TutorMiniQuestionSet(data);
    if (set.questionId !== reference.questionId || set.language !== reference.language) {
      throw new Error("Stored tutor mini question set does not match its question/language key.");
    }
    return set;
  }

  async save(input, {beforeWrite = () => {}} = {}) {
    const normalized = normalizeTutorSetInput(input);
    const documentId = await tutorSetDocumentId(normalized);
    const data = {
      ...normalized,
      miniQuestions: normalized.miniQuestions.map(question => ({
        ...question, acceptedAnswers: [...question.acceptedAnswers],
      })),
      generatedAt: this.serverTimestamp(),
    };
    beforeWrite();
    await this.writeDocument(TUTOR_COLLECTION, documentId, data, {merge: false});
    const saved = await this.get(normalized);
    if (!saved) throw new Error("Saved tutor mini question set could not be read.");
    return saved;
  }
}

export {FirestoreTutorMiniQuestionSetRepository};
