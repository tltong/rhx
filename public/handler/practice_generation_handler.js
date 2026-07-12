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
import questionHandler from "./question_handler.js?v=20260711-nested";
import questionGenerationHandler from "./question_generation_handler.js?v=20260712-deepseek-empty-retry";
import { readCompletedQuestionIds } from "./user_completed_questions_handler.js";

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

function getQuestionRefs(questions = []) {
  if (!Array.isArray(questions)) {
    throw new Error("Generated questions must be an array.");
  }

  return questions.map((question, index) => {
    const source = requireObject(question, `questions[${index}]`);

    return {
      syllabusId: requireNonEmptyString(source.syllabusId, `questions[${index}].syllabusId`),
      topicId: requireNonEmptyString(source.topicId, `questions[${index}].topicId`),
      questionId: requireNonEmptyString(
        source.questionId || source.id,
        `questions[${index}].questionId`
      )
    };
  });
}

function getQuestionIds(questions = []) {
  return getQuestionRefs(questions).map((questionRef) => questionRef.questionId);
}

function getQuestionRefKey(questionRef) {
  return `${questionRef.syllabusId}/${questionRef.topicId}/${questionRef.questionId}`;
}

function getQuestionRef(question) {
  const source = requireObject(question, "question");

  return {
    syllabusId: requireNonEmptyString(source.syllabusId, "question.syllabusId"),
    topicId: requireNonEmptyString(source.topicId, "question.topicId"),
    questionId: requireNonEmptyString(source.questionId || source.id, "question.questionId")
  };
}

function normalizeComparableString(value) {
  return String(value || "").trim().toLowerCase();
}

function questionMatchesPracticeInput(question, input) {
  return normalizeComparableString(question.syllabusId) === normalizeComparableString(input.syllabusId) &&
    normalizeComparableString(question.topicId) === normalizeComparableString(input.topicId) &&
    normalizeComparableString(question.difficulty) === normalizeComparableString(input.difficulty) &&
    normalizeComparableString(question.language) === normalizeComparableString(input.language);
}

function normalizeExistingQuestionRefs(questionRefs = []) {
  if (!Array.isArray(questionRefs)) {
    return [];
  }

  return questionRefs
    .filter((questionRef) => questionRef && typeof questionRef === "object" && !Array.isArray(questionRef))
    .map((questionRef, index) => ({
      syllabusId: requireNonEmptyString(questionRef.syllabusId, `questions[${index}].syllabusId`),
      topicId: requireNonEmptyString(questionRef.topicId, `questions[${index}].topicId`),
      questionId: requireNonEmptyString(questionRef.questionId || questionRef.id, `questions[${index}].questionId`)
    }));
}

function getLegacyQuestionIds(questionRefs = []) {
  if (!Array.isArray(questionRefs)) {
    return [];
  }

  return questionRefs
    .filter((questionRef) => typeof questionRef === "string" && questionRef.trim() !== "")
    .map((questionRef) => questionRef.trim());
}

function mergeQuestionRefs(existingQuestionRefs = [], generatedQuestionRefs = [], replaceQuestions = false) {
  const baseQuestionRefs = replaceQuestions
    ? []
    : normalizeExistingQuestionRefs(existingQuestionRefs);
  const refsByKey = new Map();

  [...baseQuestionRefs, ...generatedQuestionRefs].forEach((questionRef) => {
    refsByKey.set(getQuestionRefKey(questionRef), questionRef);
  });

  return [...refsByKey.values()];
}

function buildPracticeData(generationResult, existingPractice = null, options = {}) {
  const input = generationResult.input;
  const generatedQuestionRefs = getQuestionRefs(generationResult.questions);

  return {
    country: input.country,
    level: input.level,
    year: input.year,
    subject: input.subject,
    difficulty: input.difficulty,
    language: input.language,
    dateGenerated: new Date(),
    questions: mergeQuestionRefs(
      existingPractice?.questions,
      generatedQuestionRefs,
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

function buildQuestionSelectionResult(input, reusedQuestions, generatedResult) {
  const generatedQuestions = generatedResult?.questions || [];
  const questions = [...reusedQuestions, ...generatedQuestions];

  return {
    input: {
      ...input,
      numberOfQuestions: questions.length
    },
    requestedQuestionCount: input.numberOfQuestions,
    reusedQuestionCount: reusedQuestions.length,
    generatedQuestionCount: generatedQuestions.length,
    questions,
    questionGeneration: generatedResult
  };
}

export class PracticeGenerationHandler {
  constructor(options = {}) {
    this.questionGenerationHandler =
      options.questionGenerationHandler || questionGenerationHandler;
    this.questionHandler = options.questionHandler || questionHandler;
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

  async readAssignedPracticeIds(studentId) {
    const normalizedStudentId = requireNonEmptyString(studentId, "studentId");
    const assignedPracticeRefs = await readCollection(
      getAssignedPracticesCollectionPath(normalizedStudentId)
    );

    return assignedPracticeRefs.map((practiceRef) => practiceRef.id);
  }

  async readAssignedQuestionUsage(studentId) {
    const assignedPracticeIds = await this.readAssignedPracticeIds(studentId);
    const assignedPractices = await Promise.all(
      assignedPracticeIds.map((practiceId) => this.readPractice(practiceId))
    );
    const questionRefKeys = new Set();
    const questionIds = new Set();

    assignedPractices
      .filter(Boolean)
      .forEach((practice) => {
        normalizeExistingQuestionRefs(practice.questions).forEach((questionRef) => {
          questionRefKeys.add(getQuestionRefKey(questionRef));
          questionIds.add(questionRef.questionId);
        });

        getLegacyQuestionIds(practice.questions).forEach((questionId) => {
          questionIds.add(questionId);
        });
      });

    return {
      questionRefKeys,
      questionIds
    };
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

  async readMatchingQuestions(input) {
    const exactMatches = await this.questionHandler.readQuestionsByTopic(
      input.syllabusId,
      input.topicId,
      (collection) => collection
        .where("difficulty", "==", input.difficulty)
        .where("language", "==", input.language)
    );

    if (exactMatches.length > 0) {
      return exactMatches;
    }

    const topicQuestions = await this.questionHandler.readQuestionsByTopic(
      input.syllabusId,
      input.topicId
    );

    return topicQuestions.filter((question) => questionMatchesPracticeInput(question, input));
  }

  async readReusableQuestions(input, existingPractice = null, options = {}) {
    if (!input.studentId) {
      return [];
    }

    const completedQuestionIds = new Set(await readCompletedQuestionIds(
      input.studentId,
      input.syllabusId,
      input.topicId
    ));
    const assignedQuestionUsage = await this.readAssignedQuestionUsage(input.studentId);
    const existingPracticeQuestionRefs = options.replaceQuestions === true
      ? new Set()
      : new Set(
          normalizeExistingQuestionRefs(existingPractice?.questions)
            .map((questionRef) => getQuestionRefKey(questionRef))
        );
    const candidateQuestions = await this.readMatchingQuestions(input);

    return candidateQuestions
      .filter((question) => questionMatchesPracticeInput(question, input))
      .filter((question) => !completedQuestionIds.has(question.id))
      .filter((question) => !assignedQuestionUsage.questionIds.has(question.id))
      .filter((question) => !assignedQuestionUsage.questionRefKeys.has(getQuestionRefKey(getQuestionRef(question))))
      .filter((question) => !existingPracticeQuestionRefs.has(getQuestionRefKey(getQuestionRef(question))))
      .slice(0, input.numberOfQuestions);
  }

  async buildQuestionSet(input, existingPractice = null, options = {}) {
    const reusedQuestions = await this.readReusableQuestions(input, existingPractice, options);
    const remainingQuestionCount = input.numberOfQuestions - reusedQuestions.length;
    let generatedResult = null;

    if (remainingQuestionCount > 0) {
      generatedResult = await this.questionGenerationHandler.generateQuestions(
        {
          ...input,
          numberOfQuestions: remainingQuestionCount
        },
        getQuestionGenerationOptions(options)
      );
    }

    return buildQuestionSelectionResult(input, reusedQuestions, generatedResult);
  }

  async generatePractice(input = {}, options = {}) {
    const normalizedInput = normalizePracticeGenerationInput(input);
    let existingPractice = null;
    let practiceId = normalizedInput.practiceId;

    if (practiceId) {
      existingPractice = await this.readPractice(practiceId);
    }

    const questionSelection = await this.buildQuestionSet(
      normalizedInput,
      existingPractice,
      options
    );
    const practiceData = buildPracticeData(questionSelection, existingPractice, options);

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
      questionGeneration: questionSelection.questionGeneration,
      questionSelection: {
        requestedQuestionCount: questionSelection.requestedQuestionCount,
        reusedQuestionCount: questionSelection.reusedQuestionCount,
        generatedQuestionCount: questionSelection.generatedQuestionCount
      },
      questionRefs: getQuestionRefs(questionSelection.questions),
      questionIds: getQuestionIds(questionSelection.questions)
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
