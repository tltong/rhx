import {
  PRACTICES_COLLECTION
} from "../../../config/firebase/practice_schema.js";
import {
  createDocument,
  deleteDocument,
  readDocument
} from "../../../utils/firebase/firebase_ops.js";
import { Practice } from "../domain/practice.js";
import {
  PracticeRepository
} from "../domain/practice_repository.js";

function toPracticeRecord(practice) {
  return {
    type: practice.type,
    dateGenerated: practice.dateGenerated,
    questions: practice.questions.map((question) => ({
      syllabusId: question.syllabusId,
      topicId: question.topicId,
      questionId: question.questionId
    }))
  };
}

function requireIdentifier(value, fieldName) {
  const identifier = String(value ?? "").trim();

  if (!identifier) {
    throw new Error(`${fieldName} is required.`);
  }

  return identifier;
}

function toDate(value) {
  if (value && typeof value.toDate === "function") {
    return value.toDate();
  }

  return value;
}

function toPractice(data) {
  if (!data) {
    return null;
  }

  return new Practice({
    id: data.id,
    type: data.type,
    dateGenerated: toDate(data.dateGenerated),
    questions: data.questions || []
  });
}

export class FirestorePracticeRepository extends PracticeRepository {
  async getById(practiceId) {
    const id = requireIdentifier(practiceId, "practiceId");
    const data = await readDocument(PRACTICES_COLLECTION, id);

    return toPractice(data);
  }

  async create(practice) {
    const normalizedPractice = practice instanceof Practice
      ? practice
      : new Practice(practice);
    const result = await createDocument(
      PRACTICES_COLLECTION,
      toPracticeRecord(normalizedPractice)
    );

    normalizedPractice.id = result.id;

    return normalizedPractice;
  }

  async delete(practiceId) {
    const id = requireIdentifier(practiceId, "practiceId");

    return deleteDocument(PRACTICES_COLLECTION, id);
  }
}
