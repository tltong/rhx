import {
  QUESTION_ITEMS_SUBCOLLECTION,
  QUESTION_TOPICS_SUBCOLLECTION,
  QUESTIONS_COLLECTION,
  questionLanguages,
  questionOptionKeys,
  questionSchema
} from "../config/firebase/question_schema.js?v=20260711-nested";
import {
  createDocument,
  deleteDocument,
  getFirebaseNamespace,
  getFirestoreDb,
  readCollection,
  readDocument,
  updateDocument,
  writeDocument
} from "../utils/firebase/firebase_ops.js";
import syllabusHandler from "./syllabus_handler.js";

function requireNonEmptyString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} must be a non-empty string.`);
  }

  return value.trim();
}

function normalizeString(value, name, options = {}) {
  if (typeof value !== "string") {
    throw new Error(`${name} must be a string.`);
  }

  const normalizedValue = value.trim();

  if (!options.allowEmpty && normalizedValue === "") {
    throw new Error(`${name} must be a non-empty string.`);
  }

  return normalizedValue;
}

function requireObject(value, name) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be a non-null object.`);
  }

  return value;
}

function requireDocumentId(value, name) {
  return requireNonEmptyString(value, name);
}

function hasOwnValue(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function getAllowedAnswerKeys() {
  return Object.values(questionOptionKeys);
}

function getAllowedLanguages() {
  return Object.values(questionLanguages);
}

function getTopicsCollectionPath(syllabusId) {
  return `${QUESTIONS_COLLECTION}/${syllabusId}/${QUESTION_TOPICS_SUBCOLLECTION}`;
}

function getQuestionItemsCollectionPath(syllabusId, topicId) {
  return `${getTopicsCollectionPath(syllabusId)}/${topicId}/${QUESTION_ITEMS_SUBCOLLECTION}`;
}

function normalizeCorrectAnswer(correctAnswer) {
  const answer = requireNonEmptyString(correctAnswer, "correctAnswer").toLowerCase();

  if (!getAllowedAnswerKeys().includes(answer)) {
    throw new Error(`correctAnswer must be one of: ${getAllowedAnswerKeys().join(", ")}.`);
  }

  return answer;
}

function normalizeQuestionLanguage(language) {
  const source = requireNonEmptyString(language, "language").toLowerCase();
  const match = getAllowedLanguages().find(
    (allowedLanguage) => allowedLanguage.toLowerCase() === source
  );

  if (!match) {
    throw new Error(`language must be one of: ${getAllowedLanguages().join(", ")}.`);
  }

  return match;
}

function normalizeQuestionOptions(options = {}) {
  const source = requireObject(options, "options");
  const normalizedOptions = {};

  getAllowedAnswerKeys().forEach((optionKey) => {
    normalizedOptions[optionKey] = requireNonEmptyString(
      source[optionKey],
      `options.${optionKey}`
    );
  });

  return normalizedOptions;
}

function normalizeQuestionData(questionData = {}) {
  const source = requireObject(questionData, "questionData");

  return {
    questionText: requireNonEmptyString(source.questionText, "questionText"),
    options: normalizeQuestionOptions(source.options),
    correctAnswer: normalizeCorrectAnswer(source.correctAnswer),
    difficulty: requireNonEmptyString(source.difficulty, "difficulty"),
    specialInstruction: normalizeString(
      source.specialInstruction || "",
      "specialInstruction",
      { allowEmpty: true }
    ),
    language: normalizeQuestionLanguage(source.language),
    syllabusId: requireDocumentId(source.syllabusId, "syllabusId"),
    topicId: requireDocumentId(source.topicId, "topicId")
  };
}

function normalizeQuestionOptionUpdates(options = {}) {
  const source = requireObject(options, "options");
  const allowedKeys = getAllowedAnswerKeys();
  const normalizedOptions = {};

  Object.entries(source).forEach(([optionKey, optionValue]) => {
    if (!allowedKeys.includes(optionKey)) {
      throw new Error(`Unsupported question option key: ${optionKey}.`);
    }

    normalizedOptions[optionKey] = requireNonEmptyString(
      optionValue,
      `options.${optionKey}`
    );
  });

  if (Object.keys(normalizedOptions).length === 0) {
    throw new Error("options must include at least one option value.");
  }

  return normalizedOptions;
}

function normalizeQuestionUpdates(updates = {}) {
  const source = requireObject(updates, "updates");
  const allowedUpdates = {};

  if (hasOwnValue(source, "questionText")) {
    allowedUpdates.questionText = requireNonEmptyString(source.questionText, "questionText");
  }

  if (hasOwnValue(source, "options")) {
    const optionUpdates = normalizeQuestionOptionUpdates(source.options);

    Object.entries(optionUpdates).forEach(([optionKey, optionValue]) => {
      allowedUpdates[`options.${optionKey}`] = optionValue;
    });
  }

  if (hasOwnValue(source, "correctAnswer")) {
    allowedUpdates.correctAnswer = normalizeCorrectAnswer(source.correctAnswer);
  }

  if (hasOwnValue(source, "difficulty")) {
    allowedUpdates.difficulty = requireNonEmptyString(source.difficulty, "difficulty");
  }

  if (hasOwnValue(source, "specialInstruction")) {
    allowedUpdates.specialInstruction = normalizeString(
      source.specialInstruction,
      "specialInstruction",
      { allowEmpty: true }
    );
  }

  if (hasOwnValue(source, "language")) {
    allowedUpdates.language = normalizeQuestionLanguage(source.language);
  }

  if (hasOwnValue(source, "syllabusId")) {
    allowedUpdates.syllabusId = requireDocumentId(source.syllabusId, "syllabusId");
  }

  if (hasOwnValue(source, "topicId")) {
    allowedUpdates.topicId = requireDocumentId(source.topicId, "topicId");
  }

  if (Object.keys(allowedUpdates).length === 0) {
    throw new Error("No valid question updates were provided.");
  }

  return allowedUpdates;
}

function mergeQuestionForValidation(existingQuestion, updates) {
  const mergedQuestion = {
    ...existingQuestion,
    ...updates,
    options: {
      ...(existingQuestion.options || {})
    }
  };

  Object.entries(updates).forEach(([key, value]) => {
    if (key.startsWith("options.")) {
      mergedQuestion.options[key.replace("options.", "")] = value;
    }
  });

  return mergedQuestion;
}

function normalizeQuestionWriteItems(questions = []) {
  if (!Array.isArray(questions)) {
    throw new Error("questions must be an array.");
  }

  return questions.map((question, index) => {
    const source = requireObject(question, `questions[${index}]`);

    return {
      id: source.id || source.questionId
        ? requireDocumentId(source.id || source.questionId, `questions[${index}].id`)
        : null,
      data: normalizeQuestionData(source)
    };
  });
}

function toQuestionReference(value, syllabusId = null, topicId = null) {
  if (typeof value === "object" && value !== null) {
    return {
      questionId: requireDocumentId(value.questionId || value.id, "questionId"),
      syllabusId: value.syllabusId
        ? requireDocumentId(value.syllabusId, "syllabusId")
        : null,
      topicId: value.topicId
        ? requireDocumentId(value.topicId, "topicId")
        : null
    };
  }

  return {
    questionId: requireDocumentId(value, "questionId"),
    syllabusId: syllabusId ? requireDocumentId(syllabusId, "syllabusId") : null,
    topicId: topicId ? requireDocumentId(topicId, "topicId") : null
  };
}

function toDocumentData(snapshot) {
  if (!snapshot.exists) {
    return null;
  }

  const data = snapshot.data() || {};

  return {
    ...data,
    id: snapshot.id,
    questionId: snapshot.id,
    ...deriveQuestionPathIds(snapshot.ref.path)
  };
}

function deriveQuestionPathIds(path = "") {
  const parts = path.split("/");
  const questionsIndex = parts.lastIndexOf(QUESTIONS_COLLECTION);

  if (questionsIndex < 0) {
    return {};
  }

  return {
    syllabusId: parts[questionsIndex + 1],
    topicId: parts[questionsIndex + 3]
  };
}

function getDocumentIdFieldPath() {
  const firebaseNamespace = getFirebaseNamespace();

  return firebaseNamespace.firestore.FieldPath.documentId();
}

async function findQuestionById(questionId) {
  const id = requireDocumentId(questionId, "questionId");
  const snapshot = await getFirestoreDb()
    .collectionGroup(QUESTION_ITEMS_SUBCOLLECTION)
    .where(getDocumentIdFieldPath(), "==", id)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return readDocument(QUESTIONS_COLLECTION, id);
  }

  return toDocumentData(snapshot.docs[0]);
}

export class QuestionHandler {
  constructor(options = {}) {
    this.syllabusHandler = options.syllabusHandler || syllabusHandler;
  }

  getSchema() {
    return questionSchema;
  }

  getQuestionItemsCollectionPath(syllabusId, topicId) {
    return getQuestionItemsCollectionPath(
      requireDocumentId(syllabusId, "syllabusId"),
      requireDocumentId(topicId, "topicId")
    );
  }

  async ensureQuestionPath(syllabusId, topicId) {
    const selectedSyllabusId = requireDocumentId(syllabusId, "syllabusId");
    const selectedTopicId = requireDocumentId(topicId, "topicId");

    await writeDocument(QUESTIONS_COLLECTION, selectedSyllabusId, {}, { merge: true });
    await writeDocument(
      getTopicsCollectionPath(selectedSyllabusId),
      selectedTopicId,
      {},
      { merge: true }
    );

    return {
      syllabusId: selectedSyllabusId,
      topicId: selectedTopicId
    };
  }

  async validateSyllabusReference(syllabusId, topicId) {
    const syllabus = await this.syllabusHandler.readSyllabus(
      requireDocumentId(syllabusId, "syllabusId")
    );

    if (!syllabus) {
      throw new Error("Syllabus not found.");
    }

    const topic = await this.syllabusHandler.readTopic(
      syllabus.id,
      requireDocumentId(topicId, "topicId")
    );

    if (!topic) {
      throw new Error("Topic not found for the selected syllabus.");
    }

    return {
      syllabus,
      topic
    };
  }

  async createQuestion(questionData = {}) {
    const data = normalizeQuestionData(questionData);

    await this.validateSyllabusReference(data.syllabusId, data.topicId);
    await this.ensureQuestionPath(data.syllabusId, data.topicId);

    const result = await createDocument(
      this.getQuestionItemsCollectionPath(data.syllabusId, data.topicId),
      data
    );

    return this.readQuestion({
      syllabusId: data.syllabusId,
      topicId: data.topicId,
      questionId: result.id
    });
  }

  async readQuestion(questionRefOrId, syllabusId = null, topicId = null) {
    const ref = toQuestionReference(questionRefOrId, syllabusId, topicId);

    if (!ref.syllabusId || !ref.topicId) {
      return findQuestionById(ref.questionId);
    }

    return readDocument(
      this.getQuestionItemsCollectionPath(ref.syllabusId, ref.topicId),
      ref.questionId
    );
  }

  async readQuestions(buildQuery = null) {
    const syllabuses = await readCollection(QUESTIONS_COLLECTION);
    const questionsBySyllabus = await Promise.all(
      syllabuses.map((syllabus) => this.readQuestionsBySyllabus(syllabus.id, buildQuery))
    );

    return questionsBySyllabus.flat();
  }

  async readQuestionsBySyllabus(syllabusId, buildQuery = null) {
    const selectedSyllabusId = requireDocumentId(syllabusId, "syllabusId");
    const topics = await readCollection(getTopicsCollectionPath(selectedSyllabusId));
    const questionsByTopic = await Promise.all(
      topics.map((topic) => this.readQuestionsByTopic(
        selectedSyllabusId,
        topic.id,
        buildQuery
      ))
    );

    return questionsByTopic.flat();
  }

  async readQuestionsByTopic(syllabusId, topicId, buildQuery = null) {
    const selectedSyllabusId = requireDocumentId(syllabusId, "syllabusId");
    const selectedTopicId = requireDocumentId(topicId, "topicId");

    return readCollection(
      this.getQuestionItemsCollectionPath(selectedSyllabusId, selectedTopicId),
      buildQuery
    );
  }

  async writeQuestion(questionId, questionData = {}, options = { merge: true }) {
    const data = normalizeQuestionData(questionData);
    const id = requireDocumentId(questionId, "questionId");

    await this.validateSyllabusReference(data.syllabusId, data.topicId);
    await this.ensureQuestionPath(data.syllabusId, data.topicId);
    await writeDocument(
      this.getQuestionItemsCollectionPath(data.syllabusId, data.topicId),
      id,
      data,
      options
    );

    return this.readQuestion({
      syllabusId: data.syllabusId,
      topicId: data.topicId,
      questionId: id
    });
  }

  async writeQuestions(questions = [], options = { merge: true }) {
    const normalizedQuestions = normalizeQuestionWriteItems(questions);
    const writtenQuestions = [];

    for (const question of normalizedQuestions) {
      await this.validateSyllabusReference(question.data.syllabusId, question.data.topicId);
      await this.ensureQuestionPath(question.data.syllabusId, question.data.topicId);

      if (question.id) {
        await writeDocument(
          this.getQuestionItemsCollectionPath(question.data.syllabusId, question.data.topicId),
          question.id,
          question.data,
          options
        );
        writtenQuestions.push(await this.readQuestion({
          syllabusId: question.data.syllabusId,
          topicId: question.data.topicId,
          questionId: question.id
        }));
      } else {
        const result = await createDocument(
          this.getQuestionItemsCollectionPath(question.data.syllabusId, question.data.topicId),
          question.data
        );
        writtenQuestions.push(await this.readQuestion({
          syllabusId: question.data.syllabusId,
          topicId: question.data.topicId,
          questionId: result.id
        }));
      }
    }

    return writtenQuestions;
  }

  async updateQuestion(questionRefOrId, updates = {}, syllabusId = null, topicId = null) {
    const ref = toQuestionReference(questionRefOrId, syllabusId, topicId);
    const existingQuestion = await this.readQuestion(ref);

    if (!existingQuestion) {
      throw new Error("Question not found.");
    }

    const allowedUpdates = normalizeQuestionUpdates(updates);
    const mergedQuestion = mergeQuestionForValidation(existingQuestion, allowedUpdates);

    await this.validateSyllabusReference(mergedQuestion.syllabusId, mergedQuestion.topicId);

    const oldPath = this.getQuestionItemsCollectionPath(
      existingQuestion.syllabusId,
      existingQuestion.topicId
    );
    const newPath = this.getQuestionItemsCollectionPath(
      mergedQuestion.syllabusId,
      mergedQuestion.topicId
    );

    if (oldPath !== newPath) {
      await this.ensureQuestionPath(mergedQuestion.syllabusId, mergedQuestion.topicId);
      await writeDocument(newPath, existingQuestion.id, normalizeQuestionData(mergedQuestion), { merge: true });
      await deleteDocument(oldPath, existingQuestion.id);
    } else {
      await updateDocument(oldPath, existingQuestion.id, allowedUpdates);
    }

    return this.readQuestion({
      syllabusId: mergedQuestion.syllabusId,
      topicId: mergedQuestion.topicId,
      questionId: existingQuestion.id
    });
  }

  async deleteQuestion(questionRefOrId, syllabusId = null, topicId = null) {
    const ref = toQuestionReference(questionRefOrId, syllabusId, topicId);
    const question = await this.readQuestion(ref);

    if (!question) {
      throw new Error("Question not found.");
    }

    await deleteDocument(
      this.getQuestionItemsCollectionPath(question.syllabusId, question.topicId),
      question.id
    );

    return {
      id: question.id,
      questionId: question.id,
      syllabusId: question.syllabusId,
      topicId: question.topicId,
      deleted: true
    };
  }
}

const questionHandler = new QuestionHandler();

export function getQuestionSchema() {
  return questionHandler.getSchema();
}

export function readQuestion(questionRefOrId, syllabusId = null, topicId = null) {
  return questionHandler.readQuestion(questionRefOrId, syllabusId, topicId);
}

export function readQuestions(buildQuery = null) {
  return questionHandler.readQuestions(buildQuery);
}

export function readQuestionsBySyllabus(syllabusId, buildQuery = null) {
  return questionHandler.readQuestionsBySyllabus(syllabusId, buildQuery);
}

export function readQuestionsByTopic(syllabusId, topicId, buildQuery = null) {
  return questionHandler.readQuestionsByTopic(syllabusId, topicId, buildQuery);
}

export function writeQuestion(questionId, questionData, options = { merge: true }) {
  return questionHandler.writeQuestion(questionId, questionData, options);
}

export function writeQuestions(questions, options = { merge: true }) {
  return questionHandler.writeQuestions(questions, options);
}

export function updateQuestion(questionRefOrId, updates, syllabusId = null, topicId = null) {
  return questionHandler.updateQuestion(questionRefOrId, updates, syllabusId, topicId);
}

export function deleteQuestion(questionRefOrId, syllabusId = null, topicId = null) {
  return questionHandler.deleteQuestion(questionRefOrId, syllabusId, topicId);
}

export default questionHandler;
