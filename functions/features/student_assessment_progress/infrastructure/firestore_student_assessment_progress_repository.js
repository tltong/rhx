const {
  STUDENT_ASSESSMENT_PROGRESS_COLLECTION,
  STUDENT_ASSESSMENT_SYLLABUSES_SUBCOLLECTION,
  STUDENT_ASSESSMENT_TOPICS_SUBCOLLECTION,
} = require("../../../schema/student_assessment_progress_schema");
const firebaseOps = require("../../../utils/firebase/firebase_ops");
const {
  StudentAssessmentTopicProgress,
} = require("../domain/student_assessment_topic_progress");
const {
  StudentAssessmentProgressRepository,
} = require("../domain/student_assessment_progress_repository");

function syllabusCollectionPath(studentId) {
  return [
    STUDENT_ASSESSMENT_PROGRESS_COLLECTION,
    studentId,
    STUDENT_ASSESSMENT_SYLLABUSES_SUBCOLLECTION,
  ].join("/");
}

function topicCollectionPath(studentId, syllabusId) {
  return [
    syllabusCollectionPath(studentId),
    syllabusId,
    STUDENT_ASSESSMENT_TOPICS_SUBCOLLECTION,
  ].join("/");
}

function toProgress(data, studentId, syllabusId, topicId) {
  if (!data) {
    return null;
  }

  return new StudentAssessmentTopicProgress({
    studentId,
    syllabusId,
    topicId,
    initialLevel: data.initialLevel,
    currentLevelId: data.currentLevelId,
    isFrameworkCompleted: data.isFrameworkCompleted,
    levelHistory: data.levelHistory,
  });
}

function toProgressRecord(progress, existingData = {}) {
  return {
    initialLevel: {
      levelId: progress.initialLevel.levelId,
      setAt: progress.initialLevel.setAt,
    },
    currentLevelId: progress.currentLevelId,
    isFrameworkCompleted: progress.isFrameworkCompleted,
    levelHistory: {
      ...(existingData.levelHistory || {}),
      ...progress.levelHistory,
    },
  };
}

class FirestoreStudentAssessmentProgressRepository
  extends StudentAssessmentProgressRepository {
  constructor({
    getDocumentRef = firebaseOps.getDocumentRef,
    getFirestoreDb = firebaseOps.getFirestoreDb,
    readDocument = firebaseOps.readDocument,
  } = {}) {
    super();
    this.getDocumentRef = getDocumentRef;
    this.getFirestoreDb = getFirestoreDb;
    this.readDocument = readDocument;
  }

  async getByTopic(studentId, syllabusId, topicId) {
    const data = await this.readDocument(
      topicCollectionPath(studentId, syllabusId),
      topicId,
    );

    return toProgress(data, studentId, syllabusId, topicId);
  }

  async savePreAssessmentProgress(progress) {
    return this.saveProgress(progress);
  }

  async saveProgress(progress) {
    const normalizedProgress = progress instanceof StudentAssessmentTopicProgress
      ? progress
      : new StudentAssessmentTopicProgress(progress);
    const studentDocument = this.getDocumentRef(
      STUDENT_ASSESSMENT_PROGRESS_COLLECTION,
      normalizedProgress.studentId,
    );
    const syllabusDocument = this.getDocumentRef(
      syllabusCollectionPath(normalizedProgress.studentId),
      normalizedProgress.syllabusId,
    );
    const topicDocument = this.getDocumentRef(
      topicCollectionPath(
        normalizedProgress.studentId,
        normalizedProgress.syllabusId,
      ),
      normalizedProgress.topicId,
    );
    let savedRecord = null;

    await this.getFirestoreDb().runTransaction(async (transaction) => {
      const topicSnapshot = await transaction.get(topicDocument);
      const existingData = topicSnapshot.exists
        ? topicSnapshot.data() || {}
        : {};

      transaction.set(studentDocument, {}, {merge: true});
      transaction.set(syllabusDocument, {}, {merge: true});
      savedRecord = toProgressRecord(normalizedProgress, existingData);
      transaction.set(
        topicDocument,
        savedRecord,
        {merge: true},
      );
    });

    return toProgress(
      savedRecord,
      normalizedProgress.studentId,
      normalizedProgress.syllabusId,
      normalizedProgress.topicId,
    );
  }
}

module.exports = {
  FirestoreStudentAssessmentProgressRepository,
};
