import {
  USER_COMPLETED_QUESTIONS_COLLECTION,
  USER_COMPLETED_QUESTIONS_QUESTIONS_SUBCOLLECTION,
  USER_COMPLETED_QUESTIONS_SYLLABUSES_SUBCOLLECTION,
  USER_COMPLETED_QUESTIONS_TOPICS_SUBCOLLECTION,
  userCompletedQuestionsSchema
} from "../config/firebase/user_completed_questions_schema.js";
import {
  readCollection,
  writeDocument
} from "../utils/firebase/firebase_ops.js";

function requireNonEmptyString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} must be a non-empty string.`);
  }

  return value.trim();
}

function normalizeQuestionIds(questionIds) {
  const source = Array.isArray(questionIds) ? questionIds : [questionIds];
  const normalizedQuestionIds = source.map((questionId, index) =>
    requireNonEmptyString(questionId, `questionIds[${index}]`)
  );

  return [...new Set(normalizedQuestionIds)];
}

function getSyllabusesCollectionPath(studentId) {
  return `${USER_COMPLETED_QUESTIONS_COLLECTION}/${studentId}/${USER_COMPLETED_QUESTIONS_SYLLABUSES_SUBCOLLECTION}`;
}

function getTopicsCollectionPath(studentId, syllabusId) {
  return `${getSyllabusesCollectionPath(studentId)}/${syllabusId}/${USER_COMPLETED_QUESTIONS_TOPICS_SUBCOLLECTION}`;
}

function getQuestionsCollectionPath(studentId, syllabusId, topicId) {
  return `${getTopicsCollectionPath(studentId, syllabusId)}/${topicId}/${USER_COMPLETED_QUESTIONS_QUESTIONS_SUBCOLLECTION}`;
}

export class UserCompletedQuestionsHandler {
  getSchema() {
    return userCompletedQuestionsSchema;
  }

  async ensureQuestionPath(studentId, syllabusId, topicId) {
    const normalizedStudentId = requireNonEmptyString(studentId, "studentId");
    const normalizedSyllabusId = requireNonEmptyString(syllabusId, "syllabusId");
    const normalizedTopicId = requireNonEmptyString(topicId, "topicId");

    await writeDocument(USER_COMPLETED_QUESTIONS_COLLECTION, normalizedStudentId, {}, { merge: true });
    await writeDocument(
      getSyllabusesCollectionPath(normalizedStudentId),
      normalizedSyllabusId,
      {},
      { merge: true }
    );
    await writeDocument(
      getTopicsCollectionPath(normalizedStudentId, normalizedSyllabusId),
      normalizedTopicId,
      {},
      { merge: true }
    );

    return {
      studentId: normalizedStudentId,
      syllabusId: normalizedSyllabusId,
      topicId: normalizedTopicId
    };
  }

  async addCompletedQuestionIds(studentId, syllabusId, topicId, questionIds) {
    const path = await this.ensureQuestionPath(studentId, syllabusId, topicId);
    const normalizedQuestionIds = normalizeQuestionIds(questionIds);
    const collectionPath = getQuestionsCollectionPath(
      path.studentId,
      path.syllabusId,
      path.topicId
    );

    for (const questionId of normalizedQuestionIds) {
      await writeDocument(collectionPath, questionId, {}, { merge: true });
    }

    return {
      ...path,
      questionIds: normalizedQuestionIds,
      addedCount: normalizedQuestionIds.length
    };
  }

  addCompletedQuestionId(studentId, syllabusId, topicId, questionId) {
    return this.addCompletedQuestionIds(studentId, syllabusId, topicId, [questionId]);
  }

  async readCompletedQuestionIds(studentId, syllabusId, topicId) {
    const normalizedStudentId = requireNonEmptyString(studentId, "studentId");
    const normalizedSyllabusId = requireNonEmptyString(syllabusId, "syllabusId");
    const normalizedTopicId = requireNonEmptyString(topicId, "topicId");
    const questionRefs = await readCollection(
      getQuestionsCollectionPath(normalizedStudentId, normalizedSyllabusId, normalizedTopicId)
    );

    return questionRefs.map((questionRef) => questionRef.id);
  }
}

const userCompletedQuestionsHandler = new UserCompletedQuestionsHandler();

export function getUserCompletedQuestionsSchema() {
  return userCompletedQuestionsHandler.getSchema();
}

export function addCompletedQuestionId(studentId, syllabusId, topicId, questionId) {
  return userCompletedQuestionsHandler.addCompletedQuestionId(
    studentId,
    syllabusId,
    topicId,
    questionId
  );
}

export function addCompletedQuestionIds(studentId, syllabusId, topicId, questionIds) {
  return userCompletedQuestionsHandler.addCompletedQuestionIds(
    studentId,
    syllabusId,
    topicId,
    questionIds
  );
}

export function readCompletedQuestionIds(studentId, syllabusId, topicId) {
  return userCompletedQuestionsHandler.readCompletedQuestionIds(
    studentId,
    syllabusId,
    topicId
  );
}

export default userCompletedQuestionsHandler;
