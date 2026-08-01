import {
  llmQuestionResponseFields
} from "../../llm_prompt_generator/domain/llm_prompt_generator.js?v=20260722-resilient-diagrams";
import {
  practiceTypes
} from "../../../config/firebase/practice_schema.js?v=20260727-question-group";

const QUESTION_OPTION_KEYS = Object.freeze(["a", "b", "c", "d"]);
const QUESTION_GROUP_VALUES = new Set(Object.values(practiceTypes));

export const QUESTION_GENERATION_BATCH_SIZE = 5;

/**
 * Result returned after generated questions have been stored.
 *
 * @typedef {Object} QuestionGenerationResult
 * @property {string[]} prompts
 * @property {import("../../question/domain/question.js").Question[]} questions
 */

/**
 * @typedef {Object} QuestionGenerationInput
 * @property {number} numberOfQuestions
 * @property {string} difficultyLevel
 * @property {string} language
 * @property {string} group
 * @property {string} topicId
 * @property {string} [additionalInstructions]
 */

/**
 * @typedef {Object} PlannedQuestionCategory
 * @property {number} numberOfQuestions
 * @property {string} difficultyLevel
 * @property {boolean} hasDiagram
 */

/**
 * @typedef {Object} PlannedQuestionGenerationInput
 * @property {PlannedQuestionCategory[]} categories
 * @property {string} language
 * @property {string} group
 * @property {string} topicId
 * @property {string} [additionalInstructions]
 */

function normalizeText(value) {
  return String(value ?? "").trim();
}

function requireText(value, fieldName) {
  const normalizedValue = normalizeText(value);

  if (!normalizedValue) {
    throw new Error(`${fieldName} is required.`);
  }

  return normalizedValue;
}

function normalizeQuestionCount(value) {
  const questionCount = Number(value);

  if (!Number.isInteger(questionCount) || questionCount < 1) {
    throw new Error("Number of questions must be a positive integer.");
  }

  return questionCount;
}

function normalizeQuestionGroup(value) {
  const group = requireText(value, "Question group").toLowerCase();

  if (!QUESTION_GROUP_VALUES.has(group)) {
    throw new Error(
      `Question group must be one of: ${[...QUESTION_GROUP_VALUES].join(", ")}.`
    );
  }

  return group;
}

function createCategoryKey(difficultyLevel, hasDiagram) {
  return [
    requireText(difficultyLevel, "Difficulty level").toLowerCase(),
    hasDiagram === true
  ].join("|");
}

function normalizePlannedCategories(categories) {
  if (!Array.isArray(categories) || categories.length === 0) {
    throw new Error("At least one question category is required.");
  }

  const categoryKeys = new Set();

  return categories.map((category, index) => {
    if (!category || typeof category !== "object" || Array.isArray(category)) {
      throw new Error(`Question category ${index + 1} must be an object.`);
    }

    const difficultyLevel = requireText(
      category.difficultyLevel,
      `Question category ${index + 1} difficultyLevel`
    );
    const numberOfQuestions = normalizeQuestionCount(
      category.numberOfQuestions
    );

    if (typeof category.hasDiagram !== "boolean") {
      throw new Error(
        `Question category ${index + 1} hasDiagram must be a boolean.`
      );
    }

    const key = createCategoryKey(
      difficultyLevel,
      category.hasDiagram
    );

    if (categoryKeys.has(key)) {
      throw new Error(
        `Duplicate question category: ${difficultyLevel}, hasDiagram=${category.hasDiagram}.`
      );
    }

    categoryKeys.add(key);

    return {
      difficultyLevel,
      hasDiagram: category.hasDiagram,
      numberOfQuestions
    };
  });
}

function normalizeTopicNameKey(topicName) {
  return requireText(topicName, "topicName")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function normalizeOptions(options, questionNumber) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new Error(`Question ${questionNumber} options must be an object.`);
  }

  return Object.fromEntries(
    QUESTION_OPTION_KEYS.map((optionKey) => [
      optionKey,
      requireText(
        options[optionKey],
        `Question ${questionNumber} option ${optionKey}`
      )
    ])
  );
}

function getResponseQuestions(response) {
  if (!response || typeof response !== "object" || Array.isArray(response)) {
    throw new Error("The LLM response must be a JSON object.");
  }

  const questions = response[llmQuestionResponseFields.questions];

  if (!Array.isArray(questions)) {
    throw new Error("The LLM response must contain a questions array.");
  }

  return questions;
}

function buildTopicMap(topics) {
  const topicMap = new Map();

  topics.forEach((topic) => {
    const topicId = requireText(topic.id, "Syllabus topic ID");
    const topicName = requireText(topic.topicName, "Syllabus topic name");
    const topicKey = normalizeTopicNameKey(topicName);

    if (topicMap.has(topicKey)) {
      throw new Error(
        "Selected syllabus topics must have unique topic names for question generation."
      );
    }

    topicMap.set(topicKey, {
      id: topicId,
      topicName
    });
  });

  return topicMap;
}

function toQuestionInput({
  generatedQuestion,
  questionNumber,
  syllabusId,
  topicMap,
  generationInput,
  allowDiagrams,
  difficultyLevel = generationInput.difficultyLevel
}) {
  if (
    !generatedQuestion
    || typeof generatedQuestion !== "object"
    || Array.isArray(generatedQuestion)
  ) {
    throw new Error(`Question ${questionNumber} must be an object.`);
  }

  const fields = llmQuestionResponseFields;
  const topicName = requireText(
    generatedQuestion[fields.topicName],
    `Question ${questionNumber} topicName`
  );
  const topic = topicMap.get(normalizeTopicNameKey(topicName));

  if (!topic) {
    throw new Error(
      `Question ${questionNumber} topicName does not match a selected syllabus topic.`
    );
  }

  const correctAnswer = requireText(
    generatedQuestion[fields.correctAnswer],
    `Question ${questionNumber} correctAnswer`
  ).toLowerCase();

  if (!QUESTION_OPTION_KEYS.includes(correctAnswer)) {
    throw new Error(
      `Question ${questionNumber} correctAnswer must be a, b, c, or d.`
    );
  }

  const hasDiagram = generatedQuestion[fields.hasDiagram];

  if (typeof hasDiagram !== "boolean") {
    throw new Error(`Question ${questionNumber} hasDiagram must be a boolean.`);
  }

  if (hasDiagram && !allowDiagrams) {
    throw new Error(
      `Question ${questionNumber} includes a diagram when diagrams were not requested.`
    );
  }

  const explanation = requireText(
    generatedQuestion[fields.answerExplanation]
      ?? generatedQuestion.explanation,
    `Question ${questionNumber} answerExplanation`
  );
  const mermaidCode = hasDiagram
    ? requireText(
      generatedQuestion[fields.diagram]?.[fields.mermaidCode],
      `Question ${questionNumber} Mermaid code`
    )
    : null;

  return {
    syllabusId,
    topicId: topic.id,
    questionText: requireText(
      generatedQuestion[fields.questionText],
      `Question ${questionNumber} questionText`
    ),
    options: normalizeOptions(
      generatedQuestion[fields.options],
      questionNumber
    ),
    correctAnswer,
    group: generationInput.group,
    explanation,
    hasDiagram,
    ...(mermaidCode ? { mermaidCode } : {}),
    difficulty: requireText(difficultyLevel, "Difficulty level"),
    specialInstruction: generationInput.additionalInstructions,
    language: generationInput.language
  };
}

export function normalizeQuestionGenerationInput(generationInput = {}) {
  if (
    !generationInput
    || typeof generationInput !== "object"
    || Array.isArray(generationInput)
  ) {
    throw new Error("generationInput must be an object.");
  }

  return {
    numberOfQuestions: normalizeQuestionCount(
      generationInput.numberOfQuestions
    ),
    difficultyLevel: requireText(
      generationInput.difficultyLevel,
      "Difficulty level"
    ),
    group: normalizeQuestionGroup(generationInput.group),
    language: requireText(generationInput.language, "Language"),
    topicId: requireText(generationInput.topicId, "Topic"),
    additionalInstructions: normalizeText(
      generationInput.additionalInstructions
    )
  };
}

export function normalizePlannedQuestionGenerationInput(
  generationInput = {}
) {
  if (
    !generationInput
    || typeof generationInput !== "object"
    || Array.isArray(generationInput)
  ) {
    throw new Error("generationInput must be an object.");
  }

  return {
    categories: normalizePlannedCategories(generationInput.categories),
    group: normalizeQuestionGroup(generationInput.group),
    language: requireText(generationInput.language, "Language"),
    topicId: requireText(generationInput.topicId, "Topic"),
    additionalInstructions: normalizeText(
      generationInput.additionalInstructions
    )
  };
}

export function createQuestionBatchSizes(
  numberOfQuestions,
  batchSize = QUESTION_GENERATION_BATCH_SIZE
) {
  const questionCount = normalizeQuestionCount(numberOfQuestions);
  const normalizedBatchSize = Number(batchSize);

  if (!Number.isInteger(normalizedBatchSize) || normalizedBatchSize < 1) {
    throw new Error("Batch size must be a positive integer.");
  }

  const batchSizes = [];
  let remainingQuestions = questionCount;

  while (remainingQuestions > 0) {
    const currentBatchSize = Math.min(
      normalizedBatchSize,
      remainingQuestions
    );

    batchSizes.push(currentBatchSize);
    remainingQuestions -= currentBatchSize;
  }

  return batchSizes;
}

export function createPlannedQuestionBatches(
  categories,
  batchSize = QUESTION_GENERATION_BATCH_SIZE
) {
  const normalizedCategories = normalizePlannedCategories(categories);
  const normalizedBatchSize = Number(batchSize);

  if (!Number.isInteger(normalizedBatchSize) || normalizedBatchSize < 1) {
    throw new Error("Batch size must be a positive integer.");
  }

  const remainingCounts = normalizedCategories.map(
    (category) => category.numberOfQuestions
  );
  const batches = [];

  while (remainingCounts.some((count) => count > 0)) {
    const batchCounts = normalizedCategories.map(() => 0);
    let batchQuestionCount = 0;

    while (batchQuestionCount < normalizedBatchSize) {
      let questionAdded = false;

      for (
        let categoryIndex = 0;
        categoryIndex < normalizedCategories.length
          && batchQuestionCount < normalizedBatchSize;
        categoryIndex += 1
      ) {
        if (remainingCounts[categoryIndex] === 0) {
          continue;
        }

        remainingCounts[categoryIndex] -= 1;
        batchCounts[categoryIndex] += 1;
        batchQuestionCount += 1;
        questionAdded = true;
      }

      if (!questionAdded) {
        break;
      }
    }

    batches.push({
      numberOfQuestions: batchQuestionCount,
      categories: normalizedCategories
        .map((category, categoryIndex) => ({
          ...category,
          numberOfQuestions: batchCounts[categoryIndex]
        }))
        .filter((category) => category.numberOfQuestions > 0)
    });
  }

  return batches;
}

function resolveQuestionTopicAndLanguage(syllabus, generationInput) {
  if (!syllabus) {
    throw new Error("Selected syllabus could not be found.");
  }

  const syllabusTopics = Array.isArray(syllabus.topics)
    ? syllabus.topics
    : [];
  const topic = syllabusTopics.find(
    (syllabusTopic) => syllabusTopic.id === generationInput.topicId
  );

  if (!topic) {
    throw new Error("The selected topic does not belong to the syllabus.");
  }

  const syllabusLanguages = Array.isArray(syllabus.languages)
    ? syllabus.languages.map(normalizeText).filter(Boolean)
    : [];
  const language = syllabusLanguages.find((item) => (
    item.toLowerCase() === generationInput.language.toLowerCase()
  ));

  if (!language) {
    throw new Error("Language must be available on the selected syllabus.");
  }

  buildTopicMap([topic]);

  return {
    generationInput: {
      ...generationInput,
      language,
      topicId: topic.id
    },
    topics: [topic]
  };
}

export function resolveQuestionGenerationContext(
  syllabus,
  generationInput
) {
  return resolveQuestionTopicAndLanguage(syllabus, generationInput);
}

export function resolvePlannedQuestionGenerationContext(
  syllabus,
  generationInput
) {
  return resolveQuestionTopicAndLanguage(syllabus, generationInput);
}

export function mapLlmResponseToQuestionInputs({
  response,
  expectedQuestionCount,
  syllabusId,
  topics,
  generationInput,
  allowDiagrams = false,
  questionOffset = 0
}) {
  const generatedQuestions = getResponseQuestions(response);

  if (generatedQuestions.length !== expectedQuestionCount) {
    throw new Error(
      `The LLM returned ${generatedQuestions.length} questions; ${expectedQuestionCount} were requested for this batch.`
    );
  }

  const topicMap = buildTopicMap(topics);

  return generatedQuestions.map((generatedQuestion, questionIndex) => (
    toQuestionInput({
      generatedQuestion,
      questionNumber: questionOffset + questionIndex + 1,
      syllabusId,
      topicMap,
      generationInput,
      allowDiagrams
    })
  ));
}

export function mapLlmResponseToPlannedQuestionInputs({
  response,
  categories,
  syllabusId,
  topics,
  generationInput,
  questionOffset = 0
}) {
  const normalizedCategories = normalizePlannedCategories(categories);
  const expectedQuestionCount = normalizedCategories.reduce(
    (total, category) => total + category.numberOfQuestions,
    0
  );
  const generatedQuestions = getResponseQuestions(response);

  if (generatedQuestions.length !== expectedQuestionCount) {
    throw new Error(
      `The LLM returned ${generatedQuestions.length} questions; ${expectedQuestionCount} were requested for this batch.`
    );
  }

  const categoryMap = new Map(normalizedCategories.map((category) => [
    createCategoryKey(category.difficultyLevel, category.hasDiagram),
    {
      ...category,
      generatedCount: 0
    }
  ]));
  const topicMap = buildTopicMap(topics);
  const questionInputs = generatedQuestions.map(
    (generatedQuestion, questionIndex) => {
      if (
        !generatedQuestion
        || typeof generatedQuestion !== "object"
        || Array.isArray(generatedQuestion)
      ) {
        throw new Error(
          `Question ${questionOffset + questionIndex + 1} must be an object.`
        );
      }

      const questionNumber = questionOffset + questionIndex + 1;
      const hasDiagram = generatedQuestion[
        llmQuestionResponseFields.hasDiagram
      ];

      if (typeof hasDiagram !== "boolean") {
        throw new Error(
          `Question ${questionNumber} hasDiagram must be a boolean.`
        );
      }

      const returnedDifficulty = requireText(
        generatedQuestion[llmQuestionResponseFields.difficulty],
        `Question ${questionNumber} difficulty`
      );
      const category = categoryMap.get(
        createCategoryKey(returnedDifficulty, hasDiagram)
      );

      if (!category) {
        throw new Error(
          `Question ${questionNumber} does not match a requested difficulty/diagram category.`
        );
      }

      category.generatedCount += 1;

      if (category.generatedCount > category.numberOfQuestions) {
        throw new Error(
          `The LLM returned too many ${category.difficultyLevel} questions with hasDiagram=${category.hasDiagram}.`
        );
      }

      return toQuestionInput({
        generatedQuestion,
        questionNumber,
        syllabusId,
        topicMap,
        generationInput,
        allowDiagrams: true,
        difficultyLevel: category.difficultyLevel
      });
    }
  );

  for (const category of categoryMap.values()) {
    if (category.generatedCount !== category.numberOfQuestions) {
      throw new Error(
        `The LLM returned ${category.generatedCount} of ${category.numberOfQuestions} requested ${category.difficultyLevel} questions with hasDiagram=${category.hasDiagram}.`
      );
    }
  }

  return questionInputs;
}
