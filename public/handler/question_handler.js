import {
  QUESTIONS_COLLECTION,
  questionLanguages,
  questionOptionKeys,
  questionSchema
} from "../config/firebase/question_schema.js?v=20260711-language";
import {
  createDocument,
  deleteDocument,
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
  return {
    ...existingQuestion,
    ...updates,
    options: {
      ...(existingQuestion.options || {}),
      ...(updates.options || {})
    }
  };
}

function normalizeQuestionWriteItems(questions = []) {
  if (!Array.isArray(questions)) {
    throw new Error("questions must be an array.");
  }

  return questions.map((question, index) => {
    const source = requireObject(question, `questions[${index}]`);

    return {
      id: source.id ? requireDocumentId(source.id, `questions[${index}].id`) : null,
      data: normalizeQuestionData(source)
    };
  });
}

export class QuestionHandler {
  constructor(options = {}) {
    this.syllabusHandler = options.syllabusHandler || syllabusHandler;
  }

  getSchema() {
    return questionSchema;
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

    const result = await createDocument(QUESTIONS_COLLECTION, data);

    return this.readQuestion(result.id);
  }

  async readQuestion(questionId) {
    return readDocument(
      QUESTIONS_COLLECTION,
      requireDocumentId(questionId, "questionId")
    );
  }

  async readQuestions(buildQuery = null) {
    return readCollection(QUESTIONS_COLLECTION, buildQuery);
  }

  async readQuestionsBySyllabus(syllabusId, buildQuery = null) {
    const id = requireDocumentId(syllabusId, "syllabusId");

    return this.readQuestions((collection) => {
      const query = collection.where("syllabusId", "==", id);

      return typeof buildQuery === "function" ? buildQuery(query) : query;
    });
  }

  async readQuestionsByTopic(syllabusId, topicId, buildQuery = null) {
    const selectedSyllabusId = requireDocumentId(syllabusId, "syllabusId");
    const selectedTopicId = requireDocumentId(topicId, "topicId");

    return this.readQuestions((collection) => {
      const query = collection
        .where("syllabusId", "==", selectedSyllabusId)
        .where("topicId", "==", selectedTopicId);

      return typeof buildQuery === "function" ? buildQuery(query) : query;
    });
  }

  async writeQuestion(questionId, questionData = {}, options = { merge: true }) {
    const id = requireDocumentId(questionId, "questionId");
    const data = normalizeQuestionData(questionData);

    await this.validateSyllabusReference(data.syllabusId, data.topicId);
    await writeDocument(QUESTIONS_COLLECTION, id, data, options);

    return this.readQuestion(id);
  }

  async writeQuestions(questions = [], options = { merge: true }) {
    const normalizedQuestions = normalizeQuestionWriteItems(questions);
    const writtenQuestions = [];

    for (const question of normalizedQuestions) {
      await this.validateSyllabusReference(question.data.syllabusId, question.data.topicId);

      if (question.id) {
        await writeDocument(QUESTIONS_COLLECTION, question.id, question.data, options);
        writtenQuestions.push(await this.readQuestion(question.id));
      } else {
        const result = await createDocument(QUESTIONS_COLLECTION, question.data);
        writtenQuestions.push(await this.readQuestion(result.id));
      }
    }

    return writtenQuestions;
  }

  async updateQuestion(questionId, updates = {}) {
    const id = requireDocumentId(questionId, "questionId");
    const existingQuestion = await this.readQuestion(id);

    if (!existingQuestion) {
      throw new Error("Question not found.");
    }

    const allowedUpdates = normalizeQuestionUpdates(updates);

    if (hasOwnValue(allowedUpdates, "syllabusId") || hasOwnValue(allowedUpdates, "topicId")) {
      const mergedQuestion = mergeQuestionForValidation(existingQuestion, allowedUpdates);

      await this.validateSyllabusReference(
        mergedQuestion.syllabusId,
        mergedQuestion.topicId
      );
    }

    await updateDocument(QUESTIONS_COLLECTION, id, allowedUpdates);

    return this.readQuestion(id);
  }

  async deleteQuestion(questionId) {
    const id = requireDocumentId(questionId, "questionId");

    await deleteDocument(QUESTIONS_COLLECTION, id);

    return {
      id,
      deleted: true
    };
  }
}

const questionHandler = new QuestionHandler();

export function getQuestionSchema() {
  return questionHandler.getSchema();
}

export function readQuestion(questionId) {
  return questionHandler.readQuestion(questionId);
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

export function updateQuestion(questionId, updates) {
  return questionHandler.updateQuestion(questionId, updates);
}

export function deleteQuestion(questionId) {
  return questionHandler.deleteQuestion(questionId);
}

export default questionHandler;
