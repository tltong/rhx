const {
  PRACTICE_RESULTS_COLLECTION,
  STUDENT_SUBMISSIONS_SUBCOLLECTION,
} = require("../../../schema/practice_results_schema");
const firebaseOps = require("../../../utils/firebase/firebase_ops");
const {
  PracticeResult,
} = require("../domain/practice_result");
const {
  PracticeResultRepository,
} = require("../domain/practice_result_repository");

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
    STUDENT_SUBMISSIONS_SUBCOLLECTION,
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
      .map(([questionId, answer]) => [questionId, {...answer}])),
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
    answers: data.answers,
  });
}

class FirestorePracticeResultRepository extends PracticeResultRepository {
  constructor({
    createDocumentIfAbsent = firebaseOps.createDocumentIfAbsent,
    readCollection = firebaseOps.readCollection,
    readDocument = firebaseOps.readDocument,
    writeDocument = firebaseOps.writeDocument,
  } = {}) {
    super();
    this.createDocumentIfAbsent = createDocumentIfAbsent;
    this.readCollection = readCollection;
    this.readDocument = readDocument;
    this.writeDocument = writeDocument;
  }

  async create(practiceResult) {
    const normalizedPracticeResult = practiceResult instanceof PracticeResult
      ? practiceResult
      : new PracticeResult(practiceResult);

    await this.writeDocument(
      PRACTICE_RESULTS_COLLECTION,
      normalizedPracticeResult.practiceId,
      {},
      {merge: true},
    );

    try {
      await this.createDocumentIfAbsent(
        studentSubmissionsCollectionPath(
          normalizedPracticeResult.practiceId,
        ),
        normalizedPracticeResult.studentId,
        toPracticeResultRecord(normalizedPracticeResult),
      );
    } catch (error) {
      if (error?.code === "already-exists") {
        const duplicateError = new Error(
          "This student has already submitted this practice.",
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
      "practiceId",
    );
    const normalizedStudentId = requireIdentifier(studentId, "studentId");
    const data = await this.readDocument(
      studentSubmissionsCollectionPath(normalizedPracticeId),
      normalizedStudentId,
    );

    return toPracticeResult(
      data,
      normalizedPracticeId,
      normalizedStudentId,
    );
  }

  async listByPractice(practiceId) {
    const normalizedPracticeId = requireIdentifier(
      practiceId,
      "practiceId",
    );
    const results = await this.readCollection(
      studentSubmissionsCollectionPath(normalizedPracticeId),
    );

    return results
      .map((result) => toPracticeResult(
        result,
        normalizedPracticeId,
        result.id,
      ))
      .sort((first, second) => first.studentId.localeCompare(second.studentId));
  }
}

module.exports = {
  FirestorePracticeResultRepository,
};
