import * as firebaseOps from "../../../utils/firebase/firebase_ops.js";
import {RELIABILITY_COLLECTION, RELIABILITY_SYLLABUSES_SUBCOLLECTION, RELIABILITY_TOPICS_SUBCOLLECTION} from "../../../config/firebase/reliability_schema.js?v=20261008-reliability-v1";
import {
  requireSubjectScope, requireTopicScope, requireReliabilityScore, requireCompletedPracticeCount,
  TopicReliabilityScore, SubjectReliabilityScore,
} from "../domain/reliability_score.js?v=20261008-reliability-v1";
import {ReliabilityScoreRepository} from "../domain/reliability_score_repository.js?v=20261008-reliability-v1";

function subjectCollectionPath({studentId}) {
  return [RELIABILITY_COLLECTION, studentId, RELIABILITY_SYLLABUSES_SUBCOLLECTION].join("/");
}

function topicCollectionPath(scope) {
  return [subjectCollectionPath(scope), scope.syllabusId, RELIABILITY_TOPICS_SUBCOLLECTION].join("/");
}

class FirestoreReliabilityScoreRepository extends ReliabilityScoreRepository {
  constructor({
    readDocument = firebaseOps.readDocument,
    writeDocument = firebaseOps.writeDocument,
    serverTimestamp = () => firebaseOps.getFirebaseNamespace().firestore.FieldValue.serverTimestamp(),
  } = {}) {
    super();
    this.readDocument = readDocument;
    this.writeDocument = writeDocument;
    this.serverTimestamp = serverTimestamp;
  }

  async getTopic(input) {
    const scope = requireTopicScope(input);
    const data = await this.readDocument(topicCollectionPath(scope), scope.topicId);
    return data === null ? null : new TopicReliabilityScore(data);
  }

  async saveTopic(input) {
    const scope = requireTopicScope(input);
    const score = requireReliabilityScore(input.score);
    const completedPracticeCount = requireCompletedPracticeCount(input.completedPracticeCount);
    await this.writeDocument(topicCollectionPath(scope), scope.topicId, {
      score, completedPracticeCount, updatedAt: this.serverTimestamp(),
    }, {merge: true});
    return this.getTopic(scope);
  }

  async getSubject(input) {
    const scope = requireSubjectScope(input);
    const data = await this.readDocument(subjectCollectionPath(scope), scope.syllabusId);
    return data === null ? null : new SubjectReliabilityScore(data);
  }

  async saveSubject(input) {
    const scope = requireSubjectScope(input);
    const score = requireReliabilityScore(input.score);
    await this.writeDocument(subjectCollectionPath(scope), scope.syllabusId, {
      score, updatedAt: this.serverTimestamp(),
    }, {merge: true});
    return this.getSubject(scope);
  }
}

export {FirestoreReliabilityScoreRepository};
