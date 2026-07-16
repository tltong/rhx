import { Question } from "../domain/question.js";
import {
  questionLanguages,
  questionOptionKeys
} from "../../../config/firebase/question_schema.js";

const OPTION_KEYS = Object.values(questionOptionKeys);
const DIFFICULTY_VALUES = Object.freeze(["Easy", "Medium", "Hard"]);
const LANGUAGE_VALUES = Object.values(questionLanguages);

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

function normalizeDifficulty(value) {
  const requestedDifficulty = normalizeText(value).toLowerCase();
  const difficulty = DIFFICULTY_VALUES.find(
    (item) => item.toLowerCase() === requestedDifficulty
  );

  if (!difficulty) {
    throw new Error("Difficulty level must be Easy, Medium, or Hard.");
  }

  return difficulty;
}

function normalizeLanguage(value) {
  const requestedLanguage = normalizeText(value).toLowerCase();
  const language = LANGUAGE_VALUES.find(
    (item) => item.toLowerCase() === requestedLanguage
  );

  if (!language) {
    throw new Error(`Language must be one of: ${LANGUAGE_VALUES.join(", ")}.`);
  }

  return language;
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

function getSelectedTopics(syllabus, topicIds) {
  const syllabusTopics = Array.isArray(syllabus.topics) ? syllabus.topics : [];
  const selectedTopicIds = normalizeTopicIds(topicIds);
  const selectedTopicIdSet = new Set(selectedTopicIds);
  const selectedTopics = selectedTopicIds.length === 0
    ? syllabusTopics
    : syllabusTopics.filter((topic) => selectedTopicIdSet.has(topic.id));

  if (selectedTopics.length === 0) {
    throw new Error("The syllabus must have at least one selected topic.");
  }

  if (selectedTopicIds.length > 0 && selectedTopics.length !== selectedTopicIds.length) {
    throw new Error("One or more selected topics do not belong to the syllabus.");
  }

  return selectedTopics;
}

function getTopicNameKey(topicName) {
  return requireText(topicName, "topicName")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function buildTopicMap(topics) {
  const topicMap = new Map();

  topics.forEach((topic) => {
    const topicKey = getTopicNameKey(topic.topicName);

    if (topicMap.has(topicKey)) {
      throw new Error(
        "Selected syllabus topics must have unique topic names for question generation."
      );
    }

    topicMap.set(topicKey, topic);
  });

  return topicMap;
}

function normalizeOptions(options, questionNumber) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new Error(`Question ${questionNumber} options must be an object.`);
  }

  return Object.fromEntries(
    OPTION_KEYS.map((key) => [
      key,
      requireText(options[key], `Question ${questionNumber} option ${key}`)
    ])
  );
}

function getResponseQuestions(response) {
  if (!response || typeof response !== "object" || Array.isArray(response)) {
    throw new Error("The LLM response must be a JSON object.");
  }

  if (!Array.isArray(response.questions)) {
    throw new Error("The LLM response must contain a questions array.");
  }

  return response.questions;
}

function toQuestion({
  generatedQuestion,
  questionIndex,
  syllabusId,
  topicMap,
  difficulty,
  specialInstruction,
  language
}) {
  const questionNumber = questionIndex + 1;

  if (
    !generatedQuestion ||
    typeof generatedQuestion !== "object" ||
    Array.isArray(generatedQuestion)
  ) {
    throw new Error(`Question ${questionNumber} must be an object.`);
  }

  const topicName = requireText(
    generatedQuestion.topicName,
    `Question ${questionNumber} topicName`
  );
  const topic = topicMap.get(getTopicNameKey(topicName));

  if (!topic) {
    throw new Error(
      `Question ${questionNumber} topicName does not match a selected syllabus topic.`
    );
  }

  const correctAnswer = requireText(
    generatedQuestion.correctAnswer,
    `Question ${questionNumber} correctAnswer`
  ).toLowerCase();

  if (!OPTION_KEYS.includes(correctAnswer)) {
    throw new Error(
      `Question ${questionNumber} correctAnswer must be a, b, c, or d.`
    );
  }

  return new Question({
    syllabusId,
    topicId: topic.id,
    topicName: topic.topicName,
    questionText: requireText(
      generatedQuestion.questionText,
      `Question ${questionNumber} questionText`
    ),
    options: normalizeOptions(generatedQuestion.options, questionNumber),
    correctAnswer,
    difficulty,
    specialInstruction,
    language
  });
}

export class GenerateQuestions {
  constructor({
    generateLlmPrompt,
    generateLlmText,
    getSyllabusById,
    questionRepository
  }) {
    this.generateLlmPrompt = generateLlmPrompt;
    this.generateLlmText = generateLlmText;
    this.getSyllabusById = getSyllabusById;
    this.questionRepository = questionRepository;
  }

  async execute({
    llmPromptConfigId,
    syllabusId,
    topicIds = [],
    numberOfQuestions,
    difficultyLevel,
    additionalInstructions = "",
    language = questionLanguages.ENGLISH
  }) {
    const selectedSyllabusId = requireText(syllabusId, "syllabusId");
    const selectedConfigId = requireText(
      llmPromptConfigId,
      "llmPromptConfigId"
    );
    const questionCount = normalizeQuestionCount(numberOfQuestions);
    const difficulty = normalizeDifficulty(difficultyLevel);
    const selectedLanguage = normalizeLanguage(language);
    const specialInstruction = normalizeText(additionalInstructions);
    const syllabus = await this.getSyllabusById(selectedSyllabusId);

    if (!syllabus) {
      throw new Error("Selected syllabus could not be found.");
    }

    const selectedTopics = getSelectedTopics(syllabus, topicIds);
    const topicMap = buildTopicMap(selectedTopics);
    const selectedTopicIds = selectedTopics.map((topic) => topic.id);
    const prompt = await this.generateLlmPrompt({
      llmPromptConfigId: selectedConfigId,
      syllabusId: selectedSyllabusId,
      topicIds: selectedTopicIds,
      numberOfQuestions: questionCount,
      difficultyLevel: difficulty,
      additionalInstructions: specialInstruction
    });
    try {
      const response = await this.generateLlmText(prompt);
      const generatedQuestions = getResponseQuestions(response);

      if (generatedQuestions.length !== questionCount) {
        throw new Error(
          `The LLM returned ${generatedQuestions.length} questions; ${questionCount} were requested.`
        );
      }

      const questions = generatedQuestions.map((generatedQuestion, questionIndex) => (
        toQuestion({
          generatedQuestion,
          questionIndex,
          syllabusId: selectedSyllabusId,
          topicMap,
          difficulty,
          specialInstruction,
          language: selectedLanguage
        })
      ));

      const savedQuestions = await this.questionRepository.saveMany(questions);

      return {
        prompt,
        questions: savedQuestions
      };
    } catch (error) {
      if (error && typeof error === "object") {
        error.prompt = prompt;
      }

      throw error;
    }
  }
}
