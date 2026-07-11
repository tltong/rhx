import {
  PRACTICES_COLLECTION,
  practiceSchema
} from "../config/firebase/practice_schema.js";
import {
  ASSIGNED_PRACTICES_SUBCOLLECTION,
  STUDENT_PRACTICES_COLLECTION
} from "../config/firebase/student_practice_schema.js";
import {
  createDocument,
  readCollection,
  readDocument,
  writeDocument
} from "../utils/firebase/firebase_ops.js";
import questionGenerationHandler from "./question_generation_handler.js";

function requireNonEmptyString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} must be a non-empty string.`);
  }

  return value.trim();
}

function requireObject(value, name) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be a non-null object.`);
  }

  return value;
}

function normalizeOptionalDocumentId(value, name) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return requireNonEmptyString(value, name);
}

function normalizeYear(year) {
  const value = typeof year === "number" ? year : Number(year);

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("year must be a positive whole number.");
  }

  return value;
}

function normalizeNumberOfQuestions(value) {
  const questionCount = typeof value === "number" ? value : Number(value);

  if (!Number.isInteger(questionCount) || questionCount <= 0) {
    throw new Error("numberOfQuestions must be a positive whole number.");
  }

  return questionCount;
}

function normalizeOptionalString(value, name) {
  if (value === undefined || value === null) {
    return "";
  }

  if (typeof value !== "string") {
    throw new Error(`${name} must be a string.`);
  }

  return value.trim();
}

function normalizePracticeGenerationInput(input = {}) {
  const source = requireObject(input, "input");

  return {
    practiceId: normalizeOptionalDocumentId(source.practiceId || source.id, "practiceId"),
    studentId: normalizeOptionalDocumentId(source.studentId, "studentId"),
    country: requireNonEmptyString(source.country, "country"),
    level: requireNonEmptyString(source.level, "level"),
    year: normalizeYear(source.year),
    subject: requireNonEmptyString(source.subject, "subject"),
    syllabusId: requireNonEmptyString(source.syllabusId, "syllabusId"),
    topicId: requireNonEmptyString(source.topicId, "topicId"),
    numberOfQuestions: normalizeNumberOfQuestions(
      source.numberOfQuestions ?? source.questionCount ?? source.count
    ),
    difficulty: requireNonEmptyString(source.difficulty || source.difficultyLevel, "difficulty"),
    language: requireNonEmptyString(source.language, "language"),
    specialInstruction: normalizeOptionalString(
      source.specialInstruction,
      "specialInstruction"
    )
  };
}

function getAssignedPracticesCollectionPath(studentId) {
  return `${STUDENT_PRACTICES_COLLECTION}/${studentId}/${ASSIGNED_PRACTICES_SUBCOLLECTION}`;
}

function getQuestionIds(questions = []) {
  if (!Array.isArray(questions)) {
    throw new Error("Generated questions must be an array.");
  }

  return questions.map((question, index) => {
    const source = requireObject(question, `questions[${index}]`);

    return requireNonEmptyString(source.id, `questions[${index}].id`);
  });
}

function normalizeExistingQuestionIds(questionIds = []) {
  if (!Array.isArray(questionIds)) {
    return [];
  }

  return questionIds
    .filter((questionId) => typeof questionId === "string" && questionId.trim() !== "")
    .map((questionId) => questionId.trim());
}

function mergeQuestionIds(existingQuestionIds = [], generatedQuestionIds = [], replaceQuestions = false) {
  const baseQuestionIds = replaceQuestions
    ? []
    : normalizeExistingQuestionIds(existingQuestionIds);

  return [...new Set([...baseQuestionIds, ...generatedQuestionIds])];
}

function buildPracticeData(generationResult, existingPractice = null, options = {}) {
  const input = generationResult.input;
  const generatedQuestionIds = getQuestionIds(generationResult.questions);

  return {
    country: input.country,
    level: input.level,
    year: input.year,
    subject: input.subject,
    difficulty: input.difficulty,
    language: input.language,
    dateGenerated: new Date(),
    questions: mergeQuestionIds(
      existingPractice?.questions,
      generatedQuestionIds,
      options.replaceQuestions === true
    )
  };
}

function getQuestionGenerationOptions(options = {}) {
  return {
    provider: options.provider,
    temperature: options.temperature,
    maxTokens: options.maxTokens
  };
}

export class PracticeGenerationHandler {
  constructor(options = {}) {
    this.questionGenerationHandler =
      options.questionGenerationHandler || questionGenerationHandler;
  }

  getSchema() {
    return practiceSchema;
  }

  readPractice(practiceId) {
    return readDocument(
      PRACTICES_COLLECTION,
      requireNonEmptyString(practiceId, "practiceId")
    );
  }

  readPractices(buildQuery = null) {
    return readCollection(PRACTICES_COLLECTION, buildQuery);
  }

  async assignPracticeToStudent(studentId, practiceId) {
    const normalizedStudentId = requireNonEmptyString(studentId, "studentId");
    const normalizedPracticeId = requireNonEmptyString(practiceId, "practiceId");

    await writeDocument(STUDENT_PRACTICES_COLLECTION, normalizedStudentId, {}, { merge: true });
    await writeDocument(
      getAssignedPracticesCollectionPath(normalizedStudentId),
      normalizedPracticeId,
      {},
      { merge: true }
    );

    return {
      studentId: normalizedStudentId,
      practiceId: normalizedPracticeId,
      assigned: true
    };
  }

  async generatePractice(input = {}, options = {}) {
    const normalizedInput = normalizePracticeGenerationInput(input);
    const generationResult = await this.questionGenerationHandler.generateQuestions(
      normalizedInput,
      getQuestionGenerationOptions(options)
    );
    let existingPractice = null;
    let practiceId = normalizedInput.practiceId;

    if (practiceId) {
      existingPractice = await this.readPractice(practiceId);
    }

    const practiceData = buildPracticeData(generationResult, existingPractice, options);

    if (practiceId) {
      await writeDocument(PRACTICES_COLLECTION, practiceId, practiceData, { merge: true });
    } else {
      const result = await createDocument(PRACTICES_COLLECTION, practiceData);

      practiceId = result.id;
    }

    const practice = await this.readPractice(practiceId);
    const assignment = normalizedInput.studentId
      ? await this.assignPracticeToStudent(normalizedInput.studentId, practiceId)
      : null;

    return {
      practice,
      assignment,
      questionGeneration: generationResult,
      questionIds: getQuestionIds(generationResult.questions)
    };
  }

  generatePracticeQuestions(practiceIdOrInput, inputOrOptions = {}, options = {}) {
    if (typeof practiceIdOrInput === "string") {
      return this.generatePractice(
        {
          ...inputOrOptions,
          practiceId: practiceIdOrInput
        },
        options
      );
    }

    return this.generatePractice(practiceIdOrInput, inputOrOptions);
  }
}

const practiceGenerationHandler = new PracticeGenerationHandler();

export function getPracticeSchema() {
  return practiceGenerationHandler.getSchema();
}

export function readPractice(practiceId) {
  return practiceGenerationHandler.readPractice(practiceId);
}

export function readPractices(buildQuery = null) {
  return practiceGenerationHandler.readPractices(buildQuery);
}

export function assignPracticeToStudent(studentId, practiceId) {
  return practiceGenerationHandler.assignPracticeToStudent(studentId, practiceId);
}

export function generatePractice(input, options = {}) {
  return practiceGenerationHandler.generatePractice(input, options);
}

export function generatePracticeQuestions(practiceIdOrInput, inputOrOptions = {}, options = {}) {
  return practiceGenerationHandler.generatePracticeQuestions(
    practiceIdOrInput,
    inputOrOptions,
    options
  );
}

export default practiceGenerationHandler;
