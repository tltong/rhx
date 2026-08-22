const {
  llmQuestionResponseFields,
} = require("../../llm_prompt_generator/domain/llm_prompt_generator");
const {
  practiceTypes,
} = require("../../../schema/practice_schema");

const QUESTION_GENERATION_BATCH_SIZE = 5;
const OPTION_KEYS = Object.freeze(["a", "b", "c", "d"]);
const GROUPS = new Set(Object.values(practiceTypes));

function normalizeText(value) {
  return String(value ?? "").trim();
}

function requireText(value, fieldName) {
  const text = normalizeText(value);

  if (!text) {
    throw new Error(`${fieldName} is required.`);
  }

  return text;
}

function normalizeQuestionCount(value) {
  const count = Number(value);

  if (!Number.isInteger(count) || count < 1) {
    throw new Error("Number of questions must be a positive integer.");
  }

  return count;
}

function normalizeGroup(value) {
  const group = requireText(value, "Question group").toLowerCase();

  if (!GROUPS.has(group)) {
    throw new Error(`Question group must be one of: ${[...GROUPS].join(", ")}.`);
  }

  return group;
}

function categoryKey(difficultyLevel, hasDiagram) {
  return `${requireText(difficultyLevel, "Difficulty level").toLowerCase()}|${hasDiagram === true}`;
}

function normalizeCategories(categories) {
  if (!Array.isArray(categories) || categories.length === 0) {
    throw new Error("At least one question category is required.");
  }

  const keys = new Set();

  return categories.map((category, index) => {
    const normalized = {
      numberOfQuestions: normalizeQuestionCount(category?.numberOfQuestions),
      difficultyLevel: requireText(
        category?.difficultyLevel,
        `Question category ${index + 1} difficultyLevel`,
      ),
      hasDiagram: category?.hasDiagram,
    };

    if (typeof normalized.hasDiagram !== "boolean") {
      throw new Error(
        `Question category ${index + 1} hasDiagram must be a boolean.`,
      );
    }

    const key = categoryKey(
      normalized.difficultyLevel,
      normalized.hasDiagram,
    );

    if (keys.has(key)) {
      throw new Error(`Duplicate question category: ${key}.`);
    }

    keys.add(key);
    return normalized;
  });
}

function normalizeOptions(options, questionNumber) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new Error(`Question ${questionNumber} options must be an object.`);
  }

  return Object.fromEntries(OPTION_KEYS.map((key) => [
    key,
    requireText(options[key], `Question ${questionNumber} option ${key}`),
  ]));
}

function normalizeTopicName(value) {
  return requireText(value, "topicName").replace(/\s+/g, " ").toLowerCase();
}

function responseQuestions(response) {
  const questions = response?.[llmQuestionResponseFields.questions];

  if (!Array.isArray(questions)) {
    throw new Error("The LLM response must contain a questions array.");
  }

  return questions;
}

function toQuestionInput({
  generatedQuestion,
  questionNumber,
  syllabusId,
  topic,
  generationInput,
  allowDiagrams,
  difficultyLevel,
}) {
  if (!generatedQuestion || typeof generatedQuestion !== "object") {
    throw new Error(`Question ${questionNumber} must be an object.`);
  }

  const fields = llmQuestionResponseFields;
  const topicName = requireText(
    generatedQuestion[fields.topicName],
    `Question ${questionNumber} topicName`,
  );

  if (normalizeTopicName(topicName) !== normalizeTopicName(topic.topicName)) {
    throw new Error(
      `Question ${questionNumber} topicName does not match the selected syllabus topic.`,
    );
  }

  const correctAnswer = requireText(
    generatedQuestion[fields.correctAnswer],
    `Question ${questionNumber} correctAnswer`,
  ).toLowerCase();

  if (!OPTION_KEYS.includes(correctAnswer)) {
    throw new Error(`Question ${questionNumber} correctAnswer is invalid.`);
  }

  const hasDiagram = generatedQuestion[fields.hasDiagram];

  if (typeof hasDiagram !== "boolean" || (hasDiagram && !allowDiagrams)) {
    throw new Error(`Question ${questionNumber} has an invalid diagram setting.`);
  }

  const mermaidCode = hasDiagram
    ? requireText(
      generatedQuestion[fields.diagram]?.[fields.mermaidCode],
      `Question ${questionNumber} Mermaid code`,
    )
    : null;

  return {
    syllabusId,
    topicId: topic.id,
    questionText: requireText(
      generatedQuestion[fields.questionText],
      `Question ${questionNumber} questionText`,
    ),
    options: normalizeOptions(generatedQuestion[fields.options], questionNumber),
    correctAnswer,
    group: generationInput.group,
    explanation: requireText(
      generatedQuestion[fields.answerExplanation]
        ?? generatedQuestion.explanation,
      `Question ${questionNumber} answerExplanation`,
    ),
    hasDiagram,
    ...(mermaidCode ? { mermaidCode } : {}),
    difficulty: requireText(
      difficultyLevel || generationInput.difficultyLevel,
      "Difficulty level",
    ),
    language: generationInput.language,
    specialInstruction: generationInput.additionalInstructions,
  };
}

function normalizeQuestionGenerationInput(input = {}) {
  return {
    numberOfQuestions: normalizeQuestionCount(input.numberOfQuestions),
    difficultyLevel: requireText(input.difficultyLevel, "Difficulty level"),
    language: requireText(input.language, "Language"),
    group: normalizeGroup(input.group),
    topicId: requireText(input.topicId, "Topic"),
    additionalInstructions: normalizeText(input.additionalInstructions),
  };
}

function normalizePlannedQuestionGenerationInput(input = {}) {
  return {
    categories: normalizeCategories(input.categories),
    language: requireText(input.language, "Language"),
    group: normalizeGroup(input.group),
    topicId: requireText(input.topicId, "Topic"),
    additionalInstructions: normalizeText(input.additionalInstructions),
  };
}

function createQuestionBatchSizes(numberOfQuestions, batchSize = 5) {
  let remaining = normalizeQuestionCount(numberOfQuestions);
  const normalizedBatchSize = normalizeQuestionCount(batchSize);
  const batches = [];

  while (remaining > 0) {
    const size = Math.min(remaining, normalizedBatchSize);
    batches.push(size);
    remaining -= size;
  }

  return batches;
}

function createPlannedQuestionBatches(categories, batchSize = 5) {
  const normalized = normalizeCategories(categories);
  const remaining = normalized.map(({ numberOfQuestions }) => numberOfQuestions);
  const batches = [];

  while (remaining.some((count) => count > 0)) {
    const counts = normalized.map(() => 0);
    let batchCount = 0;

    while (batchCount < batchSize) {
      let added = false;

      for (let index = 0; index < normalized.length && batchCount < batchSize; index += 1) {
        if (remaining[index] > 0) {
          remaining[index] -= 1;
          counts[index] += 1;
          batchCount += 1;
          added = true;
        }
      }

      if (!added) {
        break;
      }
    }

    batches.push({
      numberOfQuestions: batchCount,
      categories: normalized
        .map((category, index) => ({
          ...category,
          numberOfQuestions: counts[index],
        }))
        .filter(({ numberOfQuestions }) => numberOfQuestions > 0),
    });
  }

  return batches;
}

function resolveContext(syllabus, input) {
  if (!syllabus) {
    throw new Error("Selected syllabus could not be found.");
  }

  const topic = syllabus.topics.find(({ id }) => id === input.topicId);

  if (!topic) {
    throw new Error("The selected topic does not belong to the syllabus.");
  }

  const language = syllabus.languages.find(
    (item) => item.toLowerCase() === input.language.toLowerCase(),
  );

  if (!language) {
    throw new Error("Language must be available on the selected syllabus.");
  }

  return {
    generationInput: { ...input, language },
    topics: [topic],
  };
}

function mapLlmResponseToQuestionInputs({
  response,
  expectedQuestionCount,
  syllabusId,
  topics,
  generationInput,
  allowDiagrams = false,
  questionOffset = 0,
}) {
  const questions = responseQuestions(response);

  if (questions.length !== expectedQuestionCount) {
    throw new Error(
      `The LLM returned ${questions.length} questions; ${expectedQuestionCount} were requested for this batch.`,
    );
  }

  return questions.map((question, index) => toQuestionInput({
    generatedQuestion: question,
    questionNumber: questionOffset + index + 1,
    syllabusId,
    topic: topics[0],
    generationInput,
    allowDiagrams,
  }));
}

function mapLlmResponseToPlannedQuestionInputs({
  response,
  categories,
  syllabusId,
  topics,
  generationInput,
  questionOffset = 0,
}) {
  const normalizedCategories = normalizeCategories(categories);
  const questions = responseQuestions(response);
  const expectedCount = normalizedCategories.reduce(
    (total, category) => total + category.numberOfQuestions,
    0,
  );

  if (questions.length !== expectedCount) {
    throw new Error(
      `The LLM returned ${questions.length} questions; ${expectedCount} were requested for this batch.`,
    );
  }

  const categoryMap = new Map(normalizedCategories.map((category) => [
    categoryKey(category.difficultyLevel, category.hasDiagram),
    { ...category, generatedCount: 0 },
  ]));
  const inputs = questions.map((question, index) => {
    const number = questionOffset + index + 1;
    const hasDiagram = question[llmQuestionResponseFields.hasDiagram];
    const difficulty = requireText(
      question[llmQuestionResponseFields.difficulty],
      `Question ${number} difficulty`,
    );
    const category = categoryMap.get(categoryKey(difficulty, hasDiagram));

    if (!category || category.generatedCount >= category.numberOfQuestions) {
      throw new Error(`Question ${number} does not match the requested plan.`);
    }

    category.generatedCount += 1;
    return toQuestionInput({
      generatedQuestion: question,
      questionNumber: number,
      syllabusId,
      topic: topics[0],
      generationInput,
      allowDiagrams: true,
      difficultyLevel: category.difficultyLevel,
    });
  });

  for (const category of categoryMap.values()) {
    if (category.generatedCount !== category.numberOfQuestions) {
      throw new Error("The LLM response does not match the requested plan.");
    }
  }

  return inputs;
}

module.exports = {
  QUESTION_GENERATION_BATCH_SIZE,
  createPlannedQuestionBatches,
  createQuestionBatchSizes,
  mapLlmResponseToPlannedQuestionInputs,
  mapLlmResponseToQuestionInputs,
  normalizePlannedQuestionGenerationInput,
  normalizeQuestionGenerationInput,
  resolvePlannedQuestionGenerationContext: resolveContext,
  resolveQuestionGenerationContext: resolveContext,
};
