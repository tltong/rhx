const {
  PRACTICES_COLLECTION,
} = require("../../../schema/practice_schema");
const firebaseOps = require("../../../utils/firebase/firebase_ops");
const { Practice } = require("../domain/practice");
const {
  PracticeRepository,
} = require("../domain/practice_repository");

function toPracticeRecord(practice) {
  return {
    type: practice.type,
    dateGenerated: practice.dateGenerated,
    questions: practice.questions.map((question) => ({
      syllabusId: question.syllabusId,
      topicId: question.topicId,
      questionId: question.questionId,
    })),
  };
}

class FirestorePracticeRepository extends PracticeRepository {
  constructor({
    createDocument = firebaseOps.createDocument,
  } = {}) {
    super();
    this.createDocument = createDocument;
  }

  async create(practice) {
    const normalizedPractice = practice instanceof Practice
      ? practice
      : new Practice(practice);
    const result = await this.createDocument(
      PRACTICES_COLLECTION,
      toPracticeRecord(normalizedPractice),
    );

    normalizedPractice.id = result.id;

    return normalizedPractice;
  }
}

module.exports = {
  FirestorePracticeRepository,
};
