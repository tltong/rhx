import syllabusHandler from "./syllabus_handler.js";
import questionHandler from "./question_handler.js?v=20260711-language";
import { questionLanguages } from "../config/firebase/question_schema.js?v=20260711-language";
import { generateLlmText } from "../utils/llm/llm_ops.js";

const DIFFICULTY_LEVELS = {
  EASY: "Easy",
  MEDIUM: "Medium",
  HARD: "Hard"
};

const DEFAULT_LANGUAGE = questionLanguages.ENGLISH;
const DEFAULT_MAX_QUESTIONS = 50;
export const DEFAULT_QUESTION_GENERATION_TEMPERATURE = 0.2;

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

function normalizeOptionalString(value, name) {
  if (value === undefined || value === null) {
    return "";
  }

  if (typeof value !== "string") {
    throw new Error(`${name} must be a string.`);
  }

  return value.trim();
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

  if (questionCount > DEFAULT_MAX_QUESTIONS) {
    throw new Error(`numberOfQuestions must be ${DEFAULT_MAX_QUESTIONS} or less.`);
  }

  return questionCount;
}

function normalizeTemperature(value = DEFAULT_QUESTION_GENERATION_TEMPERATURE) {
  if (value === undefined || value === null || value === "") {
    return DEFAULT_QUESTION_GENERATION_TEMPERATURE;
  }

  const temperature = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
    throw new Error("temperature must be a number between 0 and 2.");
  }

  return temperature;
}

function normalizeDifficulty(difficulty) {
  const source = requireNonEmptyString(difficulty, "difficulty").toLowerCase();
  const match = Object.values(DIFFICULTY_LEVELS).find(
    (level) => level.toLowerCase() === source
  );

  if (!match) {
    throw new Error("difficulty must be Easy, Medium, or Hard.");
  }

  return match;
}

function normalizeLanguage(language) {
  const source = requireNonEmptyString(language, "language").toLowerCase();
  const match = Object.values(questionLanguages).find(
    (allowedLanguage) => allowedLanguage.toLowerCase() === source
  );

  if (!match) {
    throw new Error(`language must be one of: ${Object.values(questionLanguages).join(", ")}.`);
  }

  return match;
}

function getDocumentId(value, name) {
  if (typeof value === "object" && value !== null && typeof value.id === "string") {
    return requireNonEmptyString(value.id, name);
  }

  return requireNonEmptyString(value, name);
}

function normalizeGenerationInput(input = {}) {
  const source = requireObject(input, "input");

  return {
    country: requireNonEmptyString(source.country, "country"),
    level: requireNonEmptyString(source.level, "level"),
    year: normalizeYear(source.year),
    subject: requireNonEmptyString(source.subject, "subject"),
    syllabusId: getDocumentId(source.syllabusId || source.syllabus, "syllabusId"),
    topicId: getDocumentId(source.topicId || source.topic, "topicId"),
    numberOfQuestions: normalizeNumberOfQuestions(
      source.numberOfQuestions || source.questionCount || source.count
    ),
    difficulty: normalizeDifficulty(source.difficulty || source.difficultyLevel),
    specialInstruction: normalizeOptionalString(
      source.specialInstruction,
      "specialInstruction"
    ),
    language: normalizeLanguage(source.language || DEFAULT_LANGUAGE)
  };
}

function normalizeComparableString(value) {
  return String(value || "").trim().toLowerCase();
}

function assertSyllabusMatchesInput(syllabus, input) {
  const expected = {
    country: input.country,
    level: input.level,
    year: input.year,
    subject: input.subject
  };

  Object.entries(expected).forEach(([field, expectedValue]) => {
    const actualValue = syllabus[field];

    if (field === "year") {
      if (Number(actualValue) !== expectedValue) {
        throw new Error("Selected syllabus does not match the requested year.");
      }

      return;
    }

    if (normalizeComparableString(actualValue) !== normalizeComparableString(expectedValue)) {
      throw new Error(`Selected syllabus does not match the requested ${field}.`);
    }
  });
}

function getTopicSubtopics(topic = {}) {
  if (!topic.subtopics || typeof topic.subtopics !== "object") {
    return [];
  }

  return Object.values(topic.subtopics)
    .filter((subtopic) => typeof subtopic === "string" && subtopic.trim() !== "")
    .map((subtopic) => subtopic.trim());
}

function buildQuestionGenerationMessages(input, syllabus, topic) {
  const subtopics = getTopicSubtopics(topic);

  return [
    {
      role: "system",
      content:
        "You generate multiple choice questions for ReadyHeroX. Return only valid JSON with a questions array."
    },
    {
      role: "user",
      content: [
        "Generate questions using this exact JSON shape:",
        '{"questions":[{"questionText":"...","options":{"a":"...","b":"...","c":"...","d":"..."},"correctAnswer":"a"}]}',
        "",
        `Country: ${input.country}`,
        `Level: ${input.level}`,
        `Year: ${input.year}`,
        `Subject: ${input.subject}`,
        `Topic name: ${topic.topicName || ""}`,
        `Subtopics: ${subtopics.length > 0 ? subtopics.join(", ") : "None specified"}`,
        `Number of questions: ${input.numberOfQuestions}`,
        `Difficulty: ${input.difficulty}`,
        `Language: ${input.language}`,
        `Special instruction: ${input.specialInstruction || "None"}`,
        "",
        "Rules:",
        "- Each question must have exactly four options: a, b, c, d.",
        "- correctAnswer must be one lowercase letter: a, b, c, or d.",
        "- Do not include explanations or markdown.",
        "- Do not include fields outside the requested JSON shape."
      ].join("\n")
    }
  ];
}

function formatMessagesForPreview(messages = []) {
  return messages
    .map((message) => `${String(message.role || "message").toUpperCase()}:\n${message.content || ""}`)
    .join("\n\n");
}

export function getQuestionGenerationPromptPreview(input = {}, syllabus = {}, topic = {}, options = {}) {
  const normalizedInput = normalizeGenerationInput(input);
  const previewSyllabus = {
    ...syllabus,
    id: syllabus.id || normalizedInput.syllabusId
  };
  const previewTopic = {
    ...topic,
    id: topic.id || normalizedInput.topicId
  };
  const messages = buildQuestionGenerationMessages(normalizedInput, previewSyllabus, previewTopic);

  return {
    temperature: normalizeTemperature(options.temperature),
    messages,
    prompt: formatMessagesForPreview(messages)
  };
}

function normalizeGeneratedOptions(options = {}) {
  if (Array.isArray(options)) {
    if (options.length < 4) {
      throw new Error("Generated question options array must include at least 4 values.");
    }

    return {
      a: requireNonEmptyString(options[0], "options.a"),
      b: requireNonEmptyString(options[1], "options.b"),
      c: requireNonEmptyString(options[2], "options.c"),
      d: requireNonEmptyString(options[3], "options.d")
    };
  }

  const source = requireObject(options, "options");

  return {
    a: requireNonEmptyString(source.a, "options.a"),
    b: requireNonEmptyString(source.b, "options.b"),
    c: requireNonEmptyString(source.c, "options.c"),
    d: requireNonEmptyString(source.d, "options.d")
  };
}

function normalizeGeneratedCorrectAnswer(correctAnswer, options) {
  const answer = requireNonEmptyString(correctAnswer, "correctAnswer")
    .toLowerCase()
    .replace(/^option\s+/, "")
    .replace(/^[\s(]+|[\s).:]+$/g, "");

  if (["a", "b", "c", "d"].includes(answer)) {
    return answer;
  }

  const matchingOption = Object.entries(options).find(
    ([, optionValue]) => normalizeComparableString(optionValue) === answer
  );

  if (matchingOption) {
    return matchingOption[0];
  }

  throw new Error("Generated question correctAnswer must be a, b, c, or d.");
}

function getGeneratedQuestionList(llmResult) {
  if (Array.isArray(llmResult)) {
    return llmResult;
  }

  const source = requireObject(llmResult, "llmResult");

  if (!Array.isArray(source.questions)) {
    throw new Error("LLM result must include a questions array.");
  }

  return source.questions;
}

function normalizeGeneratedQuestions(llmResult, input) {
  const generatedQuestions = getGeneratedQuestionList(llmResult);

  if (generatedQuestions.length < input.numberOfQuestions) {
    throw new Error(
      `LLM returned ${generatedQuestions.length} questions; expected ${input.numberOfQuestions}.`
    );
  }

  return generatedQuestions
    .slice(0, input.numberOfQuestions)
    .map((question, index) => {
      const source = requireObject(question, `questions[${index}]`);
      const options = normalizeGeneratedOptions(source.options);

      return {
        questionText: requireNonEmptyString(
          source.questionText || source.question,
          `questions[${index}].questionText`
        ),
        options,
        correctAnswer: normalizeGeneratedCorrectAnswer(
          source.correctAnswer || source.answer,
          options
        ),
        difficulty: input.difficulty,
        specialInstruction: input.specialInstruction,
        language: input.language,
        syllabusId: input.syllabusId,
        topicId: input.topicId
      };
    });
}

export class QuestionGenerationHandler {
  constructor(options = {}) {
    this.syllabusHandler = options.syllabusHandler || syllabusHandler;
    this.questionHandler = options.questionHandler || questionHandler;
    this.generateLlmText = options.generateLlmText || generateLlmText;
  }

  async getSyllabusContext(input) {
    const syllabus = await this.syllabusHandler.readSyllabus(input.syllabusId);

    if (!syllabus) {
      throw new Error("Syllabus not found.");
    }

    assertSyllabusMatchesInput(syllabus, input);

    const topic = await this.syllabusHandler.readTopic(input.syllabusId, input.topicId);

    if (!topic) {
      throw new Error("Topic not found for the selected syllabus.");
    }

    return {
      syllabus,
      topic
    };
  }

  async generateQuestions(input = {}, options = {}) {
    const normalizedInput = normalizeGenerationInput(input);
    const { syllabus, topic } = await this.getSyllabusContext(normalizedInput);
    const messages = buildQuestionGenerationMessages(normalizedInput, syllabus, topic);
    const temperature = normalizeTemperature(options.temperature);
    const llmResult = await this.generateLlmText(
      { messages },
      {
        provider: options.provider,
        temperature,
        maxTokens: options.maxTokens || Math.min(
          8192,
          Math.max(1200, normalizedInput.numberOfQuestions * 450)
        )
      }
    );
    const questions = normalizeGeneratedQuestions(llmResult, normalizedInput);
    const savedQuestions = await this.questionHandler.writeQuestions(questions);

    return {
      input: normalizedInput,
      temperature,
      syllabus,
      topic,
      requestedQuestionCount: normalizedInput.numberOfQuestions,
      generatedQuestionCount: questions.length,
      savedQuestionCount: savedQuestions.length,
      questions: savedQuestions
    };
  }
}

const questionGenerationHandler = new QuestionGenerationHandler();

export function generateQuestions(input, options = {}) {
  return questionGenerationHandler.generateQuestions(input, options);
}

export default questionGenerationHandler;
