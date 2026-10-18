const {
  STUDENT_PRACTICE_ASSESSMENTS_SUBCOLLECTION,
  STUDENT_ASSESSMENT_PROGRESS_COLLECTION,
  STUDENT_ASSESSMENT_SYLLABUSES_SUBCOLLECTION,
  STUDENT_ASSESSMENT_TOPICS_SUBCOLLECTION,
} = require("../../../schema/student_assessment_progress_schema");
const firebaseOps = require("../../../utils/firebase/firebase_ops");
const {guardResetTransaction, guardStudentMaintenance} = require("../../../utils/student_topic_reset_guard");
const {
  StudentAssessmentTopicProgress,
} = require("../domain/student_assessment_topic_progress");
const {
  StudentAssessmentProgressRepository,
} = require("../domain/student_assessment_progress_repository");

const {PracticeAssessment, requirePracticeAssessmentScope} = require("../domain/practice_assessment");

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
    assessmentRevision: data.assessmentRevision,
    levelHistory: data.levelHistory,
  });
}

function toProgressRecord(progress, existingData = {}) {
  return {
    initialLevel: {
      levelId: progress.initialLevel.levelId,
      setAt: progress.initialLevel.setAt,
    },
    assessmentRevision: progress.assessmentRevision,
    currentLevelId: progress.currentLevelId,
    isFrameworkCompleted: progress.isFrameworkCompleted,
    levelHistory: {
      ...(existingData.levelHistory || {}),
      ...progress.levelHistory,
    },
  };
}

function progressFingerprint(progress) {
  if (progress === null || progress === undefined) return null;
  const normalized = progress instanceof StudentAssessmentTopicProgress ? progress : new StudentAssessmentTopicProgress(progress);
  return JSON.stringify([
    normalized.assessmentRevision, normalized.initialLevel.levelId, normalized.initialLevel.setAt.getTime(), normalized.currentLevelId, normalized.isFrameworkCompleted,
    Object.entries(normalized.levelHistory).sort(([a], [b]) => a.localeCompare(b)).map(([id, date]) => [id, date.getTime()]),
  ]);
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

  async getPracticeAssessment(input) {
    const scope = requirePracticeAssessmentScope(input);
    const data = await this.readDocument(
      [STUDENT_ASSESSMENT_PROGRESS_COLLECTION, scope.studentId, STUDENT_PRACTICE_ASSESSMENTS_SUBCOLLECTION].join("/"),
      scope.practiceId,
    );
    return data === null ? null : new PracticeAssessment({...data, ...scope});
  }

  async listEssayAssessmentScores(input) {
    const collection = [STUDENT_ASSESSMENT_PROGRESS_COLLECTION, input.studentId, STUDENT_PRACTICE_ASSESSMENTS_SUBCOLLECTION].join("/");
    const snapshot = await this.getFirestoreDb().collection(collection).where("practiceType", "==", "essay").get();
    return snapshot.docs.map(doc => new PracticeAssessment({...doc.data(), studentId: input.studentId, practiceId: doc.id}))
      .filter(record => record.syllabusId === input.syllabusId && record.topicId === input.topicId
        && record.assessmentFrameworkId === input.assessmentFrameworkId && record.previousLevelId === input.levelId)
      .map(record => record.score);
  }

  async saveAssessmentProgress({progress, assessment, expectedProgress, sourceCompletion, assertAccess = () => {}}) {
    const normalizedProgress = progress instanceof StudentAssessmentTopicProgress ? progress : new StudentAssessmentTopicProgress(progress);
    const outcome = new PracticeAssessment(assessment);
    if (outcome.studentId !== normalizedProgress.studentId || outcome.syllabusId !== normalizedProgress.syllabusId
        || outcome.topicId !== normalizedProgress.topicId || outcome.levelId !== normalizedProgress.currentLevelId) {
      throw new Error("The assessment does not match the topic progress.");
    }
    const assessmentDocument = this.getDocumentRef(
      [STUDENT_ASSESSMENT_PROGRESS_COLLECTION, outcome.studentId, STUDENT_PRACTICE_ASSESSMENTS_SUBCOLLECTION].join("/"), outcome.practiceId,
    );
    const topicDocument = this.getDocumentRef(topicCollectionPath(outcome.studentId, outcome.syllabusId), outcome.topicId);
    const studentDocument = this.getDocumentRef(STUDENT_ASSESSMENT_PROGRESS_COLLECTION, outcome.studentId);
    const syllabusDocument = this.getDocumentRef(syllabusCollectionPath(outcome.studentId), outcome.syllabusId);
    return this.getFirestoreDb().runTransaction(async transaction => {
      await guardResetTransaction(transaction, this.getFirestoreDb());
      if (sourceCompletion) {
        const db = this.getFirestoreDb();
        await guardStudentMaintenance(transaction, db.collection("studentPracticeResets").doc(outcome.studentId));
        const source = await transaction.get(db.collection("studentEssayPractices").doc(outcome.studentId)
          .collection("completedEssayPractices").doc(outcome.practiceId));
        const date = source.data()?.completedAt?.toDate?.() ?? source.data()?.completedAt;
        if (!source.exists || !(date instanceof Date) || date.getTime() !== sourceCompletion.completedAt.getTime()
            || source.data().essayQuestionId !== sourceCompletion.essayQuestionId
            || source.data().syllabusId !== outcome.syllabusId || source.data().topicId !== outcome.topicId) {
          throw Object.assign(new Error("The source essay was removed or reset."), {code: "topic-practice-reset"});
        }
      }
      assertAccess();
      const [saved, topic] = await Promise.all([transaction.get(assessmentDocument), transaction.get(topicDocument)]);
      const currentProgress = toProgress(topic.exists ? topic.data() : null, outcome.studentId, outcome.syllabusId, outcome.topicId);
      if (saved.exists) {
        const original = new PracticeAssessment({...saved.data(), studentId: outcome.studentId, practiceId: outcome.practiceId});
        if (original.syllabusId !== outcome.syllabusId || original.topicId !== outcome.topicId || original.practiceType !== outcome.practiceType) throw new Error("The saved assessment has a conflicting topic.");
        if (currentProgress === null) throw new Error("Saved assessment topic progress is missing.");
        return {assessment: original, progress: currentProgress};
      }
      if (progressFingerprint(currentProgress) !== progressFingerprint(expectedProgress)) {
        const error = new Error("Topic progress changed during assessment. Retry with the current progress.");
        error.code = "aborted";
        throw error;
      }
      const record = {...toProgressRecord(normalizedProgress, topic.exists ? topic.data() : {}),
        assessmentRevision: (currentProgress?.assessmentRevision ?? 0) + 1};
      assertAccess();
      const {studentId, practiceId, ...assessmentRecord} = outcome;
      transaction.set(studentDocument, {}, {merge: true});
      transaction.set(syllabusDocument, {}, {merge: true});
      transaction.set(topicDocument, record, {merge: true});
      transaction.set(assessmentDocument, assessmentRecord);
      return {assessment: outcome, progress: toProgress(record, outcome.studentId, outcome.syllabusId, outcome.topicId)};
    });
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
      await guardResetTransaction(transaction, this.getFirestoreDb());
      const topicSnapshot = await transaction.get(topicDocument);
      const existingData = topicSnapshot.exists
        ? topicSnapshot.data() || {}
        : {};

      transaction.set(studentDocument, {}, {merge: true});
      transaction.set(syllabusDocument, {}, {merge: true});
      savedRecord = {...toProgressRecord(normalizedProgress, existingData), assessmentRevision: (existingData.assessmentRevision ?? 0) + 1};
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
