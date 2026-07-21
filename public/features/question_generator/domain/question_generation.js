import {
  llmQuestionResponseFields
} from "../../llm_prompt_generator/domain/llm_prompt_generator.js?v=20260722-resilient-diagrams";

const QUESTION_OPTION_KEYS = Object.freeze(["a", "b", "c", "d"]);

export const QUESTION_GENERATION_BATCH_SIZE = 5;

/**
 * Result returned after generated questions have been stored.
 *
 * @typedef {Object} QuestionGenerationResult
 * @property {string[]} prompts
 * @property {import("../../question/domain/question.js").Question[]} questions
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

function normalizeTopicIds(topicIds) {
  if (topicIds === undefined || topicIds === null) {
    return [];
  }

  if (!Array.isArray(topicIds)) {
    throw new Error("topicIds must be an array.");
  }

  return Array.from(
    new Set(topicIds.map(normalizeText).filter(Boolean))
  );
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
  hasDiagram
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

  if (typeof generatedQuestion[fields.hasDiagram] !== "boolean") {
    throw new Error(`Question ${questionNumber} hasDiagram must be a boolean.`);
  }

  if (generatedQuestion[fields.hasDiagram] !== hasDiagram) {
    throw new Error(
      `Question ${questionNumber} hasDiagram does not match the requested generation mode.`
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
    explanation,
    hasDiagram,
    ...(mermaidCode ? { mermaidCode } : {}),
    difficulty: generationInput.difficultyLevel,
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
    language: requireText(generationInput.language, "Language"),
    topicIds: normalizeTopicIds(generationInput.topicIds),
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

export function resolveQuestionGenerationContext(
  syllabus,
  generationInput
) {
  if (!syllabus) {
    throw new Error("Selected syllabus could not be found.");
  }

  const syllabusTopics = Array.isArray(syllabus.topics)
    ? syllabus.topics
    : [];
  const selectedTopicIdSet = new Set(generationInput.topicIds);
  const topics = generationInput.topicIds.length === 0
    ? syllabusTopics
    : syllabusTopics.filter((topic) => selectedTopicIdSet.has(topic.id));

  if (topics.length === 0) {
    throw new Error("The selected syllabus must have at least one topic.");
  }

  if (
    generationInput.topicIds.length > 0
    && topics.length !== generationInput.topicIds.length
  ) {
    throw new Error("One or more selected topics do not belong to the syllabus.");
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

  buildTopicMap(topics);

  return {
    generationInput: {
      ...generationInput,
      language,
      topicIds: topics.map((topic) => topic.id)
    },
    topics
  };
}

export function mapLlmResponseToQuestionInputs({
  response,
  expectedQuestionCount,
  syllabusId,
  topics,
  generationInput,
  hasDiagram = false,
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
      hasDiagram
    })
  ));
}
