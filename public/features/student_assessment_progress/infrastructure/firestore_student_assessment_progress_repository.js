import {
  STUDENT_ASSESSMENT_PROGRESS_COLLECTION,
  STUDENT_ASSESSMENT_SYLLABUSES_SUBCOLLECTION,
  STUDENT_ASSESSMENT_TOPICS_SUBCOLLECTION
} from "../../../config/firebase/student_assessment_progress_schema.js";
import {
  getDocumentRef,
  getFirestoreDb,
  readDocument
} from "../../../utils/firebase/firebase_ops.js";
import {
  StudentAssessmentTopicProgress
} from "../domain/student_assessment_topic_progress.js?v=20260813-pre-assessment-progress";
import {
  StudentAssessmentProgressRepository
} from "../domain/student_assessment_progress_repository.js?v=20260813-pre-assessment-progress";

function syllabusCollectionPath(studentId) {
  return [
    STUDENT_ASSESSMENT_PROGRESS_COLLECTION,
    studentId,
    STUDENT_ASSESSMENT_SYLLABUSES_SUBCOLLECTION
  ].join("/");
}

function topicCollectionPath(studentId, syllabusId) {
  return [
    syllabusCollectionPath(studentId),
    syllabusId,
    STUDENT_ASSESSMENT_TOPICS_SUBCOLLECTION
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
    levelHistory: data.levelHistory
  });
}

function toProgressRecord(progress, existingData = {}) {
  return {
    initialLevel: {
      levelId: progress.initialLevel.levelId,
      setAt: progress.initialLevel.setAt
    },
    currentLevelId: progress.currentLevelId,
    isFrameworkCompleted: progress.isFrameworkCompleted,
    levelHistory: {
      ...(existingData.levelHistory || {}),
      ...progress.levelHistory
    }
  };
}

export class FirestoreStudentAssessmentProgressRepository
  extends StudentAssessmentProgressRepository {
  async getByTopic(studentId, syllabusId, topicId) {
    const data = await readDocument(
      topicCollectionPath(studentId, syllabusId),
      topicId
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
    const studentDocument = getDocumentRef(
      STUDENT_ASSESSMENT_PROGRESS_COLLECTION,
      normalizedProgress.studentId
    );
    const syllabusDocument = getDocumentRef(
      syllabusCollectionPath(normalizedProgress.studentId),
      normalizedProgress.syllabusId
    );
    const topicDocument = getDocumentRef(
      topicCollectionPath(
        normalizedProgress.studentId,
        normalizedProgress.syllabusId
      ),
      normalizedProgress.topicId
    );
    let savedRecord = null;

    await getFirestoreDb().runTransaction(async (transaction) => {
      const topicSnapshot = await transaction.get(topicDocument);
      const existingData = topicSnapshot.exists
        ? topicSnapshot.data() || {}
        : {};

      transaction.set(studentDocument, {}, { merge: true });
      transaction.set(syllabusDocument, {}, { merge: true });
      savedRecord = toProgressRecord(normalizedProgress, existingData);
      transaction.set(
        topicDocument,
        savedRecord,
        { merge: true }
      );
    });

    return toProgress(
      savedRecord,
      normalizedProgress.studentId,
      normalizedProgress.syllabusId,
      normalizedProgress.topicId
    );
  }
}
