const {
  SYLLABUSES_COLLECTION,
  SYLLABUS_TOPICS_SUBCOLLECTION,
} = require("../../../schema/syllabuses_schema");
const firebaseOps = require("../../../utils/firebase/firebase_ops");
const { createSyllabusLanguageKey, Syllabus, SyllabusTopic } = require("../domain/syllabus");
const { SyllabusRepository } = require("../domain/syllabus_repository");

function requireNonEmptyString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} must be a non-empty string.`);
  }

  return value.trim();
}

function getTopicsCollectionPath(syllabusId) {
  return [
    SYLLABUSES_COLLECTION,
    syllabusId,
    SYLLABUS_TOPICS_SUBCOLLECTION,
  ].join("/");
}

function toTopic(data) {
  return new SyllabusTopic({
    id: data.id,
    topicName: data.topicName,
    pausable: data.pausable,
    assessmentFrameworkIds: data.assessmentFrameworkIds,
    subtopics: data.subtopics || {},
    preAssessmentPractices: data.preAssessmentPractices || {},
  });
}

function toSyllabus(data, topics) {
  return new Syllabus({
    id: data.id,
    assessmentFrameworkId: data.assessmentFrameworkId,
    active: data.active === true,
    country: data.country,
    languages: data.languages || [],
    level: data.level,
    subject: data.subject,
    year: data.year,
    topics,
  });
}

function compareSyllabuses(first, second) {
  const firstScope = [
    first.country,
    first.level,
    first.year,
    first.subject,
  ].join("|");
  const secondScope = [
    second.country,
    second.level,
    second.year,
    second.subject,
  ].join("|");

  return firstScope.localeCompare(secondScope);
}

class FirestoreSyllabusRepository extends SyllabusRepository {
  constructor({
    readDocument = firebaseOps.readDocument,
    readCollection = firebaseOps.readCollection,
    writeDocument = firebaseOps.writeDocument,
  } = {}) {
    super();
    this.readDocument = readDocument;
    this.readCollection = readCollection;
    this.writeDocument = writeDocument;
  }



  async assignTopicAssessmentFramework({syllabusId, topicId, language, assessmentFrameworkId}, {assertAccess = () => {}} = {}) {
    assertAccess();
    const db = firebaseOps.getFirestoreDb();
    const ref = db.collection(getTopicsCollectionPath(syllabusId)).doc(topicId);
    const {FieldPath, FieldValue} = require("firebase-admin/firestore");
    await db.runTransaction(async transaction => {
      assertAccess();
      const snapshot = await transaction.get(ref);
      assertAccess();
      if (!snapshot.exists) throw new Error("Syllabus topic could not be found.");
      transaction.update(ref, new FieldPath("assessmentFrameworkIds", createSyllabusLanguageKey(language)),
        assessmentFrameworkId === null ? FieldValue.delete() : assessmentFrameworkId);
    });
  }

  async assignPreAssessmentPractice(syllabusId, topicId, assignment) {
    const languageKey = createSyllabusLanguageKey(assignment.language);
    await this.writeDocument(
      getTopicsCollectionPath(syllabusId), topicId,
      {preAssessmentPractices: {[languageKey]: {
        language: assignment.language, practiceId: assignment.practiceId, practiceType: assignment.practiceType,
      }}},
      {merge: true},
    );
    return assignment;
  }

  async getById(syllabusId) {
    const id = requireNonEmptyString(syllabusId, "syllabusId");
    const data = await this.readDocument(SYLLABUSES_COLLECTION, id);

    if (!data) {
      return null;
    }

    const topicRecords = await this.readCollection(
      getTopicsCollectionPath(id),
    );
    const topics = topicRecords.map(toTopic);

    return toSyllabus({ ...data, id }, topics);
  }

  async list() {
    const syllabusRecords = await this.readCollection(
      SYLLABUSES_COLLECTION,
    );
    const syllabuses = await Promise.all(
      syllabusRecords.map(async (record) => {
        const id = requireNonEmptyString(record.id, "syllabus id");
        const topicRecords = await this.readCollection(
          getTopicsCollectionPath(id),
        );

        return toSyllabus(
          { ...record, id },
          topicRecords.map(toTopic),
        );
      }),
    );

    return syllabuses.sort(compareSyllabuses);
  }
}

module.exports = {
  FirestoreSyllabusRepository,
};
