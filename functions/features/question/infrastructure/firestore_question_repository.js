const {
  QUESTIONS_COLLECTION,
  QUESTION_TOPICS_SUBCOLLECTION,
  QUESTION_ITEMS_SUBCOLLECTION,
} = require("../../../schema/question_schema");
const firebaseOps = require("../../../utils/firebase/firebase_ops");
const {
  Question,
  normalizeQuestionGroup,
} = require("../domain/question");
const {
  QuestionRepository,
} = require("../domain/question_repository");

function requireIdentifier(value, fieldName) {
  const identifier = String(value ?? "").trim();

  if (!identifier) {
    throw new Error(`${fieldName} is required.`);
  }

  return identifier;
}

function getTopicsCollectionPath(syllabusId) {
  return [
    QUESTIONS_COLLECTION,
    syllabusId,
    QUESTION_TOPICS_SUBCOLLECTION,
  ].join("/");
}

function getQuestionItemsCollectionPath(syllabusId, topicId) {
  return [
    getTopicsCollectionPath(syllabusId),
    topicId,
    QUESTION_ITEMS_SUBCOLLECTION,
  ].join("/");
}

function normalizeListOptions(options = {}) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new Error("options must be an object.");
  }

  let limit = null;

  if (options.limit !== undefined && options.limit !== null) {
    limit = Number(options.limit);

    if (!Number.isInteger(limit) || limit < 1) {
      throw new Error("limit must be a positive integer.");
    }
  }

  const group = options.group === undefined || options.group === null
    ? null
    : normalizeQuestionGroup(options.group);

  return { group, limit };
}

function toQuestion(data, syllabusId, topicId) {
  if (!data) {
    return null;
  }

  return new Question({
    id: data.id,
    syllabusId,
    topicId,
    questionText: data.questionText,
    options: data.options,
    correctAnswer: data.correctAnswer,
    group: data.group,
    explanation: data.explanation || "",
    hasDiagram: data.hasDiagram === true,
    svg: data.svg || "",
    difficulty: data.difficulty,
    language: data.language,
    specialInstruction: data.specialInstruction || "",
  });
}

function normalizeQuestion(question) {
  return question instanceof Question
    ? question
    : new Question(question);
}

function toQuestionRecord(question) {
  return {
    questionText: question.questionText,
    options: { ...question.options },
    correctAnswer: question.correctAnswer,
    group: question.group,
    hasDiagram: question.hasDiagram,
    svg: question.svg,
    explanation: question.explanation,
    difficulty: question.difficulty,
    specialInstruction: question.specialInstruction,
    language: question.language,
    syllabusId: question.syllabusId,
    topicId: question.topicId,
  };
}

class FirestoreQuestionRepository extends QuestionRepository {
  constructor({
    createDocument = firebaseOps.createDocument,
    deleteDocument = firebaseOps.deleteDocument,
    readCollection = firebaseOps.readCollection,
    readDocument = firebaseOps.readDocument,
    writeDocument = firebaseOps.writeDocument,
  } = {}) {
    super();
    this.createDocument = createDocument;
    this.deleteDocument = deleteDocument;
    this.readCollection = readCollection;
    this.readDocument = readDocument;
    this.writeDocument = writeDocument;
  }

  async ensureParentDocuments(syllabusId, topicIds) {
    await this.writeDocument(
      QUESTIONS_COLLECTION,
      syllabusId,
      {},
      { merge: true },
    );
    const topicsCollectionPath = getTopicsCollectionPath(syllabusId);

    await Promise.all(
      [...topicIds].map((topicId) =>
        this.writeDocument(
          topicsCollectionPath,
          topicId,
          {},
          { merge: true },
        ),
      ),
    );
  }

  async getById(syllabusId, topicId, questionId) {
    const normalizedSyllabusId = requireIdentifier(
      syllabusId,
      "syllabusId",
    );
    const normalizedTopicId = requireIdentifier(topicId, "topicId");
    const normalizedQuestionId = requireIdentifier(
      questionId,
      "questionId",
    );
    const data = await this.readDocument(
      getQuestionItemsCollectionPath(
        normalizedSyllabusId,
        normalizedTopicId,
      ),
      normalizedQuestionId,
    );

    return toQuestion(data, normalizedSyllabusId, normalizedTopicId);
  }

  async listByTopic(syllabusId, topicId, options = {}) {
    const normalizedSyllabusId = requireIdentifier(
      syllabusId,
      "syllabusId",
    );
    const normalizedTopicId = requireIdentifier(topicId, "topicId");
    const { group, limit } = normalizeListOptions(options);
    const questions = await this.readCollection(
      getQuestionItemsCollectionPath(
        normalizedSyllabusId,
        normalizedTopicId,
      ),
      (collection) => {
        const query = group === null
          ? collection
          : collection.where("group", "==", group);

        return limit === null ? query : query.limit(limit);
      },
    );

    return questions
      .map((question) =>
        toQuestion(
          question,
          normalizedSyllabusId,
          normalizedTopicId,
        ),
      )
      .sort((first, second) => first.id.localeCompare(second.id));
  }

  async save(question) {
    const normalizedQuestion = normalizeQuestion(question);

    await this.ensureParentDocuments(
      normalizedQuestion.syllabusId,
      new Set([normalizedQuestion.topicId]),
    );
    const collectionPath = getQuestionItemsCollectionPath(
      normalizedQuestion.syllabusId,
      normalizedQuestion.topicId,
    );
    const record = toQuestionRecord(normalizedQuestion);

    if (normalizedQuestion.id) {
      await this.writeDocument(
        collectionPath,
        normalizedQuestion.id,
        record,
        { merge: false },
      );
    } else {
      const result = await this.createDocument(collectionPath, record);
      normalizedQuestion.id = result.id;
    }

    return normalizedQuestion;
  }

  async saveMany(questions) {
    if (!Array.isArray(questions) || questions.length === 0) {
      throw new Error("At least one question is required.");
    }

    const normalizedQuestions = questions.map(normalizeQuestion);
    const topicsBySyllabus = new Map();

    normalizedQuestions.forEach((question) => {
      if (!topicsBySyllabus.has(question.syllabusId)) {
        topicsBySyllabus.set(question.syllabusId, new Set());
      }

      topicsBySyllabus.get(question.syllabusId).add(question.topicId);
    });

    await Promise.all(
      [...topicsBySyllabus.entries()].map(([syllabusId, topicIds]) =>
        this.ensureParentDocuments(syllabusId, topicIds),
      ),
    );

    await Promise.all(
      normalizedQuestions.map(async (question) => {
        const collectionPath = getQuestionItemsCollectionPath(
          question.syllabusId,
          question.topicId,
        );
        const record = toQuestionRecord(question);

        if (question.id) {
          await this.writeDocument(
            collectionPath,
            question.id,
            record,
            { merge: false },
          );
          return;
        }

        const result = await this.createDocument(
          collectionPath,
          record,
        );
        question.id = result.id;
      }),
    );

    return normalizedQuestions;
  }

  async delete(syllabusId, topicId, questionId) {
    return this.deleteDocument(
      getQuestionItemsCollectionPath(
        requireIdentifier(syllabusId, "syllabusId"),
        requireIdentifier(topicId, "topicId"),
      ),
      requireIdentifier(questionId, "questionId"),
    );
  }
}

module.exports = {
  FirestoreQuestionRepository,
};
