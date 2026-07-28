import {
  PRACTICES_COLLECTION
} from "../../../config/firebase/practice_schema.js";
import {
  createDocument
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

export class FirestorePracticeRepository extends PracticeRepository {
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
}
