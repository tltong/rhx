const {
  PRACTICES_COLLECTION,
  practiceTypes,
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
    questions: practice.questions.map((question) => {
      const reference = {
        syllabusId: question.syllabusId,
        topicId: question.topicId,
        questionId: question.questionId,
      };

      if (practice.type === practiceTypes.ASSESSMENT) {
        reference.language = question.language;
        reference.hasDiagram = question.hasDiagram;
      }

      return reference;
    }),
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
    questions: data.questions || [],
  });
}

class FirestorePracticeRepository extends PracticeRepository {
  constructor({
    createDocument = firebaseOps.createDocument,
    deleteDocument = firebaseOps.deleteDocument,
    readDocument = firebaseOps.readDocument,
  } = {}) {
    super();
    this.createDocument = createDocument;
    this.deleteDocument = deleteDocument;
    this.readDocument = readDocument;
  }

  async getById(practiceId) {
    const id = requireIdentifier(practiceId, "practiceId");
    const data = await this.readDocument(PRACTICES_COLLECTION, id);

    return toPractice(data);
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

  async delete(practiceId) {
    const id = requireIdentifier(practiceId, "practiceId");

    return this.deleteDocument(PRACTICES_COLLECTION, id);
  }
}

module.exports = {
  FirestorePracticeRepository,
};
