const {FieldValue} = require("firebase-admin/firestore");
const firebaseOps = require("../../../utils/firebase/firebase_ops");
const {guardResetTransaction, hasResetGuard} = require("../../../utils/student_topic_reset_guard");
const {RELIABILITY_COLLECTION, RELIABILITY_SYLLABUSES_SUBCOLLECTION, RELIABILITY_TOPICS_SUBCOLLECTION} = require("../../../schema/reliability_schema");
const {
  requireSubjectScope, requireTopicScope, requireReliabilityScore, requireCompletedPracticeCount,
  TopicReliabilityScore, SubjectReliabilityScore,
} = require("../domain/reliability_score");
const {ReliabilityScoreRepository} = require("../domain/reliability_score_repository");

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
    serverTimestamp = () => FieldValue.serverTimestamp(),
    getFirestoreDb = firebaseOps.getFirestoreDb,
  } = {}) {
    super();
    this.readDocument = readDocument;
    this.writeDocument = writeDocument;
    this.serverTimestamp = serverTimestamp;
    this.getFirestoreDb = getFirestoreDb;
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
    await this.writeScore(topicCollectionPath(scope), scope.topicId, {
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
    await this.writeScore(subjectCollectionPath(scope), scope.syllabusId, {
      score, updatedAt: this.serverTimestamp(),
    }, {merge: true});
    return this.getSubject(scope);
  }

  async writeScore(collectionPath, id, data, options) {
    if (!hasResetGuard()) return this.writeDocument(collectionPath, id, data, options);
    const db = this.getFirestoreDb();
    return db.runTransaction(async transaction => {
      await guardResetTransaction(transaction, db);
      transaction.set(db.collection(collectionPath).doc(id), data, options);
    });
  }
}

module.exports = {FirestoreReliabilityScoreRepository};
