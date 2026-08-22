const {
  QUESTIONS_COLLECTION,
  QUESTION_TOPICS_SUBCOLLECTION,
  QUESTION_LANGUAGES_SUBCOLLECTION,
  QUESTION_DIAGRAM_GROUPS_SUBCOLLECTION,
  questionDiagramGroups,
  QUESTION_ITEMS_SUBCOLLECTION,
} = require("../../../schema/question_schema");
const firebaseOps = require("../../../utils/firebase/firebase_ops");
const {
  Question,
  normalizeQuestionGroup,
  normalizeQuestionGroupRoute,
  normalizeQuestionHasDiagram,
  normalizeQuestionReference,
  toQuestionLanguageDocumentId,
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

function getLanguagesCollectionPath(syllabusId, topicId) {
  return [
    getTopicsCollectionPath(syllabusId),
    topicId,
    QUESTION_LANGUAGES_SUBCOLLECTION,
  ].join("/");
}

function getDiagramGroupsCollectionPath(syllabusId, topicId, language) {
  return [
    getLanguagesCollectionPath(syllabusId, topicId),
    toQuestionLanguageDocumentId(language),
    QUESTION_DIAGRAM_GROUPS_SUBCOLLECTION,
  ].join("/");
}

function getDiagramGroupDocumentId(hasDiagram) {
  return normalizeQuestionHasDiagram(hasDiagram)
    ? questionDiagramGroups.WITH_DIAGRAM
    : questionDiagramGroups.WITHOUT_DIAGRAM;
}

function getQuestionItemsCollectionPath(
  syllabusId,
  topicId,
  language,
  hasDiagram,
) {
  return [
    getDiagramGroupsCollectionPath(syllabusId, topicId, language),
    getDiagramGroupDocumentId(hasDiagram),
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
  const difficulty = options.difficulty === undefined
      || options.difficulty === null
    ? null
    : requireIdentifier(options.difficulty, "options.difficulty")
      .toLocaleLowerCase();

  return {
    difficulty,
    group,
    limit,
    language: requireIdentifier(options.language, "options.language"),
    hasDiagram: normalizeQuestionHasDiagram(
      options.hasDiagram,
      "options.hasDiagram",
    ),
  };
}

function toQuestion(data, questionRoute) {
  if (!data) {
    return null;
  }

  const question = new Question({
    id: data.id,
    syllabusId: questionRoute.syllabusId,
    topicId: questionRoute.topicId,
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

  if (
    toQuestionLanguageDocumentId(question.language)
      !== toQuestionLanguageDocumentId(questionRoute.language)
    || question.hasDiagram !== questionRoute.hasDiagram
  ) {
    throw new Error(
      `Question ${question.id} does not match its language/diagram path.`,
    );
  }

  return question;
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
    countCollection = firebaseOps.countCollection,
    deleteDocument = firebaseOps.deleteDocument,
    readCollection = firebaseOps.readCollection,
    readCollectionIds = firebaseOps.readCollectionIds,
    readDocument = firebaseOps.readDocument,
    readDocuments = firebaseOps.readDocuments,
    writeDocument = firebaseOps.writeDocument,
  } = {}) {
    super();
    this.createDocument = createDocument;
    this.countCollection = countCollection;
    this.deleteDocument = deleteDocument;
    this.readCollection = readCollection;
    this.readCollectionIds = readCollectionIds;
    this.readDocument = readDocument;
    this.readDocuments = readDocuments;
    this.writeDocument = writeDocument;
  }

  async ensureParentDocuments({
    syllabusId,
    topicId,
    language,
    hasDiagram,
  }) {
    const topicsCollectionPath = getTopicsCollectionPath(syllabusId);
    const languagesCollectionPath = getLanguagesCollectionPath(
      syllabusId,
      topicId,
    );
    const diagramGroupsCollectionPath = getDiagramGroupsCollectionPath(
      syllabusId,
      topicId,
      language,
    );

    await Promise.all([
      this.writeDocument(
        QUESTIONS_COLLECTION,
        syllabusId,
        {},
        { merge: true },
      ),
      this.writeDocument(
        topicsCollectionPath,
        topicId,
        {},
        { merge: true },
      ),
      this.writeDocument(
        languagesCollectionPath,
        toQuestionLanguageDocumentId(language),
        { language },
        { merge: true },
      ),
      this.writeDocument(
        diagramGroupsCollectionPath,
        getDiagramGroupDocumentId(hasDiagram),
        { hasDiagram },
        { merge: true },
      ),
    ]);
  }

  async getById(questionReference) {
    const normalizedReference = normalizeQuestionReference(
      questionReference,
    );
    const data = await this.readDocument(
      getQuestionItemsCollectionPath(
        normalizedReference.syllabusId,
        normalizedReference.topicId,
        normalizedReference.language,
        normalizedReference.hasDiagram,
      ),
      normalizedReference.questionId,
    );

    return toQuestion(data, normalizedReference);
  }

  async getManyById(questionReferences) {
    if (!Array.isArray(questionReferences)) {
      throw new Error("questionReferences must be an array.");
    }

    const normalizedReferences = questionReferences.map(
      (questionReference, index) => normalizeQuestionReference(
        questionReference,
        `questionReferences[${index}]`,
      ),
    );
    const questions = await this.readDocuments(
      normalizedReferences.map((questionReference) => ({
        collectionPath: getQuestionItemsCollectionPath(
          questionReference.syllabusId,
          questionReference.topicId,
          questionReference.language,
          questionReference.hasDiagram,
        ),
        documentId: questionReference.questionId,
      })),
    );

    return questions.map((question, index) => (
      toQuestion(question, normalizedReferences[index])
    ));
  }

  async countByGroup(questionGroup) {
    const normalizedGroup = normalizeQuestionGroupRoute(questionGroup);

    return this.countCollection(
      getQuestionItemsCollectionPath(
        normalizedGroup.syllabusId,
        normalizedGroup.topicId,
        normalizedGroup.language,
        normalizedGroup.hasDiagram,
      ),
    );
  }

  async listIdsByGroup(questionGroup) {
    const normalizedGroup = normalizeQuestionGroupRoute(questionGroup);

    return this.readCollectionIds(
      getQuestionItemsCollectionPath(
        normalizedGroup.syllabusId,
        normalizedGroup.topicId,
        normalizedGroup.language,
        normalizedGroup.hasDiagram,
      ),
    );
  }

  async listByTopic(syllabusId, topicId, options = {}) {
    const normalizedSyllabusId = requireIdentifier(
      syllabusId,
      "syllabusId",
    );
    const normalizedTopicId = requireIdentifier(topicId, "topicId");
    const {
      group,
      difficulty,
      limit,
      language,
      hasDiagram,
    } = normalizeListOptions(options);
    const questions = await this.readCollection(
      getQuestionItemsCollectionPath(
        normalizedSyllabusId,
        normalizedTopicId,
        language,
        hasDiagram,
      ),
      (collection) => {
        const query = group === null
          ? collection
          : collection.where("group", "==", group);

        return limit === null || difficulty !== null
          ? query
          : query.limit(limit);
      },
    );

    const matchingQuestions = questions
      .map((question) =>
        toQuestion(
          question,
          {
            syllabusId: normalizedSyllabusId,
            topicId: normalizedTopicId,
            language,
            hasDiagram,
          },
        ),
      )
      .filter((question) => (
        difficulty === null
        || question.difficulty.toLocaleLowerCase() === difficulty
      ))
      .sort((first, second) => first.id.localeCompare(second.id));

    return limit === null
      ? matchingQuestions
      : matchingQuestions.slice(0, limit);
  }

  async save(question) {
    const normalizedQuestion = normalizeQuestion(question);

    await this.ensureParentDocuments(normalizedQuestion);
    const collectionPath = getQuestionItemsCollectionPath(
      normalizedQuestion.syllabusId,
      normalizedQuestion.topicId,
      normalizedQuestion.language,
      normalizedQuestion.hasDiagram,
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
    const uniqueBranches = new Map();

    normalizedQuestions.forEach((question) => {
      const key = JSON.stringify([
        question.syllabusId,
        question.topicId,
        toQuestionLanguageDocumentId(question.language),
        question.hasDiagram,
      ]);

      uniqueBranches.set(key, question);
    });

    await Promise.all(
      [...uniqueBranches.values()].map((question) =>
        this.ensureParentDocuments(question),
      ),
    );

    await Promise.all(
      normalizedQuestions.map(async (question) => {
        const collectionPath = getQuestionItemsCollectionPath(
          question.syllabusId,
          question.topicId,
          question.language,
          question.hasDiagram,
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

  async delete(questionReference) {
    const normalizedReference = normalizeQuestionReference(
      questionReference,
    );

    return this.deleteDocument(
      getQuestionItemsCollectionPath(
        normalizedReference.syllabusId,
        normalizedReference.topicId,
        normalizedReference.language,
        normalizedReference.hasDiagram,
      ),
      normalizedReference.questionId,
    );
  }
}

module.exports = {
  FirestoreQuestionRepository,
};
