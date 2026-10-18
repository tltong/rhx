import {
  PRACTICE_RESULTS_COLLECTION,
  STUDENT_SUBMISSIONS_SUBCOLLECTION
} from "../../../config/firebase/practice_results_schema.js";
import {
  getFirestoreDb,
  readCollection,
  readDocument
} from "../../../utils/firebase/firebase_ops.js";
import {guardStudentMaintenance} from "../../../utils/student_topic_reset_guard.js?v=20261018-topic-reset-v1";
import {
  PracticeResult
} from "../domain/practice_result.js?v=20260807-practice-result";
import {
  PracticeResultRepository
} from "../domain/practice_result_repository.js";

function requireIdentifier(value, fieldName) {
  const identifier = String(value ?? "").trim();

  if (!identifier) {
    throw new Error(`${fieldName} is required.`);
  }

  return identifier;
}

function studentSubmissionsCollectionPath(practiceId) {
  return [
    PRACTICE_RESULTS_COLLECTION,
    practiceId,
    STUDENT_SUBMISSIONS_SUBCOLLECTION
  ].join("/");
}

function toPracticeResultRecord(practiceResult) {
  return {
    submittedAt: practiceResult.submittedAt,
    timeTakenSeconds: practiceResult.timeTakenSeconds,
    questionsCorrect: practiceResult.questionsCorrect,
    totalQuestions: practiceResult.totalQuestions,
    score: practiceResult.score,
    answers: Object.fromEntries(Object.entries(practiceResult.answers)
      .map(([questionId, answer]) => [questionId, { ...answer }]))
  };
}

function toPracticeResult(data, practiceId, studentId) {
  if (!data) {
    return null;
  }

  return new PracticeResult({
    practiceId,
    studentId,
    submittedAt: data.submittedAt,
    timeTakenSeconds: data.timeTakenSeconds,
    questionsCorrect: data.questionsCorrect,
    totalQuestions: data.totalQuestions,
    score: data.score,
    answers: data.answers
  });
}

export class FirestorePracticeResultRepository
  extends PracticeResultRepository {
  constructor({getFirestoreDbOperation = getFirestoreDb} = {}) {
    super(); this.getFirestoreDb = getFirestoreDbOperation;
  }
  async create(practiceResult, {questionReferences = []} = {}) {
    const normalizedPracticeResult = practiceResult instanceof PracticeResult
      ? practiceResult
      : new PracticeResult(practiceResult);

    try {
      const {studentId, practiceId} = normalizedPracticeResult, db = this.getFirestoreDb();
      await db.runTransaction(async transaction => {
        const reset = db.collection("studentPracticeResets").doc(studentId);
        const state = await guardStudentMaintenance(transaction, reset);
        const key = scope => encodeURIComponent(JSON.stringify([scope.syllabusId, scope.topicId]));
        if (questionReferences.some(scope => state?.topics?.[key(scope)])) {
          const student = db.collection("studentPractices").doc(studentId);
          const [assigned, completed] = await Promise.all([
            transaction.get(student.collection("assignedPractices").doc(practiceId)),
            transaction.get(student.collection("completedPractices").doc(practiceId)),
          ]);
          if (!assigned.exists && !completed.exists) throw Object.assign(new Error("This practice was removed by a topic reset."), {code: "topic-practice-reset"});
        }
        const result = db.collection(studentSubmissionsCollectionPath(practiceId)).doc(studentId);
        if ((await transaction.get(result)).exists) throw Object.assign(new Error("Result exists"), {code: "already-exists"});
        transaction.set(db.collection(PRACTICE_RESULTS_COLLECTION).doc(practiceId), {}, {merge: true});
        transaction.set(result, toPracticeResultRecord(normalizedPracticeResult));
      });
    } catch (error) {
      if (error?.code === "already-exists") {
        const duplicateError = new Error(
          "This student has already submitted this practice."
        );
        duplicateError.code = "practice-result-already-exists";
        throw duplicateError;
      }

      throw error;
    }

    return normalizedPracticeResult;
  }

  async getById(practiceId, studentId) {
    const normalizedPracticeId = requireIdentifier(
      practiceId,
      "practiceId"
    );
    const normalizedStudentId = requireIdentifier(studentId, "studentId");
    const data = await readDocument(
      studentSubmissionsCollectionPath(normalizedPracticeId),
      normalizedStudentId
    );

    return toPracticeResult(
      data,
      normalizedPracticeId,
      normalizedStudentId
    );
  }

  async listByPractice(practiceId) {
    const normalizedPracticeId = requireIdentifier(
      practiceId,
      "practiceId"
    );
    const results = await readCollection(
      studentSubmissionsCollectionPath(normalizedPracticeId)
    );

    return results
      .map((result) => toPracticeResult(
        result,
        normalizedPracticeId,
        result.id
      ))
      .sort((first, second) => first.studentId.localeCompare(second.studentId));
  }
}
