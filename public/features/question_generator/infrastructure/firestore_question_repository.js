import { QuestionRepository } from "../domain/question_repository.js";
import {
  QUESTIONS_COLLECTION,
  QUESTION_ITEMS_SUBCOLLECTION,
  QUESTION_TOPICS_SUBCOLLECTION,
  questionLanguages,
  questionOptionKeys
} from "../../../config/firebase/question_schema.js";
import {
  createDocument,
  writeDocument
} from "../../../utils/firebase/firebase_ops.js";

const OPTION_KEYS = Object.values(questionOptionKeys);
const LANGUAGE_VALUES = new Set(Object.values(questionLanguages));

function requireText(value, fieldName) {
  const normalizedValue = String(value ?? "").trim();

  if (!normalizedValue) {
    throw new Error(`${fieldName} is required.`);
  }

  return normalizedValue;
}

function normalizeOptions(options) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new Error("Question options must be an object.");
  }

  return Object.fromEntries(
    OPTION_KEYS.map((key) => [
      key,
      requireText(options[key], `options.${key}`)
    ])
  );
}

function normalizeLanguage(language) {
  const selectedLanguage = requireText(language, "language");

  if (!LANGUAGE_VALUES.has(selectedLanguage)) {
    throw new Error(
      `language must be one of: ${Array.from(LANGUAGE_VALUES).join(", ")}.`
    );
  }

  return selectedLanguage;
}

function getTopicsCollectionPath(syllabusId) {
  return [
    QUESTIONS_COLLECTION,
    syllabusId,
    QUESTION_TOPICS_SUBCOLLECTION
  ].join("/");
}

function getQuestionItemsCollectionPath(syllabusId, topicId) {
  return [
    getTopicsCollectionPath(syllabusId),
    topicId,
    QUESTION_ITEMS_SUBCOLLECTION
  ].join("/");
}

function toQuestionRecord(question) {
  const correctAnswer = requireText(
    question.correctAnswer,
    "correctAnswer"
  ).toLowerCase();

  if (!OPTION_KEYS.includes(correctAnswer)) {
    throw new Error("correctAnswer must be a, b, c, or d.");
  }

  return {
    questionText: requireText(question.questionText, "questionText"),
    options: normalizeOptions(question.options),
    correctAnswer,
    difficulty: requireText(question.difficulty, "difficulty"),
    specialInstruction: String(question.specialInstruction ?? "").trim(),
    language: normalizeLanguage(question.language),
    syllabusId: requireText(question.syllabusId, "syllabusId"),
    topicId: requireText(question.topicId, "topicId")
  };
}

export class FirestoreQuestionRepository extends QuestionRepository {
  async saveMany(questions) {
    if (!Array.isArray(questions) || questions.length === 0) {
      throw new Error("At least one question is required.");
    }

    const questionRecords = questions.map((question) => ({
      question,
      record: toQuestionRecord(question)
    }));
    const syllabusIds = new Set(
      questionRecords.map(({ record }) => record.syllabusId)
    );

    if (syllabusIds.size !== 1) {
      throw new Error("All generated questions must belong to one syllabus.");
    }

    const [syllabusId] = syllabusIds;
    const topicIds = Array.from(
      new Set(questionRecords.map(({ record }) => record.topicId))
    );

    await writeDocument(
      QUESTIONS_COLLECTION,
      syllabusId,
      {},
      { merge: true }
    );

    await Promise.all(
      topicIds.map((topicId) => writeDocument(
        getTopicsCollectionPath(syllabusId),
        topicId,
        {},
        { merge: true }
      ))
    );

    await Promise.all(
      questionRecords.map(async ({ question, record }) => {
        const result = await createDocument(
          getQuestionItemsCollectionPath(syllabusId, record.topicId),
          record
        );

        question.id = result.id;
      })
    );

    return questions;
  }
}
