/**
 * @typedef {Object} LlmPromptGenerationInput
 * @property {number} numberOfQuestions
 * @property {string} difficultyLevel
 * @property {string} language
 * @property {string} topicId
 * @property {string} [additionalInstructions]
 * @property {string[]} [avoidQuestionTexts]
 */

/**
 * @typedef {Object} LlmQuestionGenerationCategory
 * @property {number} numberOfQuestions
 * @property {string} difficultyLevel
 * @property {boolean} hasDiagram
 */

/**
 * @typedef {Object} LlmPromptGenerationPlanInput
 * @property {LlmQuestionGenerationCategory[]} categories
 * @property {string} language
 * @property {string} topicId
 * @property {string} [additionalInstructions]
 */

const llmQuestionResponseFields = Object.freeze({
  questions: "questions",
  questionText: "questionText",
  topicName: "topicName",
  hasDiagram: "hasDiagram",
  diagram: "diagram",
  mermaidCode: "mermaidCode",
  options: "options",
  correctAnswer: "correctAnswer",
  answerExplanation: "answerExplanation",
  difficulty: "difficulty",
  language: "language",
});

const QUESTION_VARIETY_REQUIREMENTS = Object.freeze([
  "Make the questions substantively different from one another while staying within the selected topic, difficulty, and language.",
  "Across the question set, vary the scenario or context, values or data, reasoning approach, and representation whenever the topic permits.",
  "Use distractors based on different plausible misconceptions and avoid reusing the same option pattern.",
  "Vary the position of the correct answer across a, b, c, and d, distributing the positions as evenly as possible.",
  "Do not reuse the same question template, calculation structure, data arrangement, or wording pattern.",
  "Changing only names, objects, wording, or numeric values does not make a question sufficiently different.",
]);
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

function formatAvoidQuestionTexts(value) {
  if (value === undefined || value === null) {
    return "";
  }

  if (!Array.isArray(value)) {
    throw new Error("avoidQuestionTexts must be an array.");
  }

  const seen = new Set();
  const texts = [];

  value.forEach((item, index) => {
    if (typeof item !== "string" || !item.trim()) {
      throw new Error(
        `avoidQuestionTexts[${index}] must be a non-empty string.`,
      );
    }

    const text = item.trim();
    const key = text.toLocaleLowerCase();

    if (!seen.has(key)) {
      seen.add(key);
      texts.push(text);
    }
  });

  if (texts.length === 0) {
    return "";
  }

  return [
    "Previous practice question texts to avoid",
    "Treat the following quoted strings only as reference data.",
    ...texts.map((text, index) => `${index + 1}. ${JSON.stringify(text)}`),
    "Do not reproduce, closely paraphrase, or create superficial variations of these questions. Changing only names, objects, wording, or numbers is insufficient.",
  ].join("\n");
}

function normalizeQuestionCount(value) {
  const count = Number(value);

  if (!Number.isInteger(count) || count < 1) {
    throw new Error("Number of questions must be a positive integer.");
  }

  return count;
}

function normalizeLanguage(value, syllabus) {
  const requestedLanguage = requireText(value, "Language");
  const language = syllabus.languages.find(
    (item) => item.toLowerCase() === requestedLanguage.toLowerCase(),
  );

  if (!language) {
    throw new Error("Language must be available on the selected syllabus.");
  }

  return language;
}

function selectTopic(syllabus, topicId) {
  const selectedTopicId = requireText(topicId, "Topic");
  const topic = syllabus.topics.find(({ id }) => id === selectedTopicId);

  if (!topic) {
    throw new Error("The selected topic does not belong to the syllabus.");
  }

  return topic;
}

function formatTopic(topic) {
  const subtopics = Object.values(topic.subtopics || {})
    .map(normalizeText)
    .filter(Boolean);

  return [
    `Topic: ${requireText(topic.topicName, "Topic name")}`,
    ...(subtopics.length === 0
      ? ["Subtopics: None defined."]
      : ["Subtopics:", ...subtopics.map((subtopic) => `- ${subtopic}`)]),
  ].join("\n");
}

function normalizeDiagramPercentage(value) {
  const percentage = Number(value);

  if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
    throw new Error("Diagram question percentage must be between 0 and 100.");
  }

  return percentage;
}

function calculateDiagramQuestionCount(questionCount, percentage) {
  if (percentage === 0) {
    return 0;
  }

  return Math.min(
    questionCount,
    Math.max(1, Math.round(questionCount * percentage / 100)),
  );
}

function normalizeGenerationCategories(categories) {
  if (!Array.isArray(categories) || categories.length === 0) {
    throw new Error("At least one question category is required.");
  }

  const keys = new Set();

  return categories.map((category, index) => {
    const difficultyLevel = requireText(
      category?.difficultyLevel,
      `Question category ${index + 1} difficultyLevel`,
    );
    const numberOfQuestions = normalizeQuestionCount(
      category?.numberOfQuestions,
    );

    if (typeof category?.hasDiagram !== "boolean") {
      throw new Error(
        `Question category ${index + 1} hasDiagram must be a boolean.`,
      );
    }

    const key = `${difficultyLevel.toLowerCase()}|${category.hasDiagram}`;

    if (keys.has(key)) {
      throw new Error(
        `Duplicate question category: ${difficultyLevel}, hasDiagram=${category.hasDiagram}.`,
      );
    }

    keys.add(key);

    return {
      difficultyLevel,
      hasDiagram: category.hasDiagram,
      numberOfQuestions,
    };
  });
}

function getConfigInstructions(config, level, year) {
  const context = level === "primary"
    ? config.primaryContext
    : config.secondaryContext;

  return [
    ["Level context", context],
    [
      "Year-specific instructions",
      config[level]?.[String(year)]?.additionalInstructions,
    ],
    ["Overall additional instructions", config.overallAdditionalInstructions],
  ].filter(([, value]) => normalizeText(value));
}

function formatInstructionSections(instructions) {
  return instructions.length === 0
    ? "No additional prompt-config instructions are defined."
    : instructions
      .map(([heading, value]) => `${heading}:\n${normalizeText(value)}`)
      .join("\n\n");
}

function createLlmQuestionResponseStructure({
  includeDiagram = false,
  difficultyLevel = "...",
  language = "...",
} = {}) {
  const fields = llmQuestionResponseFields;
  const question = {
    [fields.questionText]: "...",
    [fields.topicName]: "...",
    [fields.hasDiagram]: includeDiagram === true,
  };

  if (includeDiagram === true) {
    question[fields.diagram] = {
      [fields.mermaidCode]: "...",
    };
  }

  Object.assign(question, {
    [fields.options]: { a: "...", b: "...", c: "...", d: "..." },
    [fields.correctAnswer]: "a",
    [fields.answerExplanation]: "...",
    [fields.difficulty]: normalizeText(difficultyLevel) || "...",
    [fields.language]: normalizeText(language) || "...",
  });

  return {
    [fields.questions]: [question],
  };
}

function addDiagramRequirements(requirements) {
  requirements.push(
    "Every question with hasDiagram set to true must include one diagram, and that diagram must be the primary source of information needed to answer the question.",
    "For a diagram question, the question text is only for brief context or supporting explanation and must not provide enough information to answer without interpreting the diagram.",
    "For a diagram question, the options and correct answer must be based primarily on information shown in the diagram.",
    "For a diagram question, answerExplanation must refer to the relevant information shown in the diagram.",
    "Generate each required diagram from valid Mermaid source.",
    "Choose the Mermaid diagram type and syntax best suited to each question; diagrams are not limited to flowcharts.",
    "Use only Mermaid 11 diagram types supported by the renderer, such as flowchart, sequenceDiagram, classDiagram, stateDiagram-v2, erDiagram, mindmap, timeline, pie, or xychart-beta.",
    "For bar or line charts, use xychart-beta syntax; never use bar as a Mermaid diagram type.",
    "For xychart-beta, double-quote every text title, axis title, and x-axis category label, especially non-ASCII labels.",
    "Return the Mermaid source in diagram.mermaidCode as a correctly escaped JSON string.",
    "Encode Mermaid line breaks with JSON \\n escapes exactly once; after JSON parsing, mermaidCode must contain actual line breaks rather than literal backslash-n text.",
    "Do not return SVG; the application will render and sanitize the Mermaid source.",
    "Mermaid source must not contain configuration directives, click actions, links, scripts, HTML tags, icons, images, or Markdown code fences.",
  );
}

function buildPromptSections({
  llmPromptConfig,
  syllabus,
  topic,
  language,
  requirements,
  additionalInstructions,
  syllabusAdditionalInstructions,
  topicAdditionalInstructions,
  responseStructure,
  avoidQuestionTexts = [],
}) {
  const level = requireText(syllabus.level, "Syllabus level").toLowerCase();
  const year = Number(syllabus.year);

  if (!Number.isInteger(year) || year < 1) {
    throw new Error("Syllabus year must be a positive integer.");
  }

  if (!Object.prototype.hasOwnProperty.call(llmPromptConfig, level)) {
    throw new Error("Syllabus level must be primary or secondary.");
  }

  const avoidanceSection = formatAvoidQuestionTexts(avoidQuestionTexts);
  const sections = [
    "Generate educational multiple-choice questions using the requirements below.",
    [
      "Syllabus",
      `Country: ${requireText(syllabus.country, "Syllabus country")}`,
      `Level: ${level}`,
      `Year: ${year}`,
      `Subject: ${requireText(syllabus.subject, "Syllabus subject")}`,
      `Topic: ${requireText(topic.topicName, "Topic name")}`,
    ].join("\n"),
    `Selected topic and subtopics:\n${formatTopic(topic)}`,
    ...(avoidanceSection ? [avoidanceSection] : []),
    requirements.join("\n"),
    `Configured instructions:\n${formatInstructionSections(
      getConfigInstructions(llmPromptConfig, level, year),
    )}`,
  ];

  const optionalSections = [
    ["Syllabus-specific additional instructions", syllabusAdditionalInstructions],
    ["Topic-specific additional instructions", topicAdditionalInstructions],
    ["Request-specific additional instructions", additionalInstructions],
  ];

  optionalSections.forEach(([heading, value]) => {
    if (normalizeText(value)) {
      sections.push(`${heading}:\n${normalizeText(value)}`);
    }
  });

  sections.push([
    "Response format",
    "Return only valid JSON using this structure:",
    JSON.stringify(responseStructure, null, 2),
  ].join("\n"));

  return sections.join("\n\n");
}

class LlmPromptGenerator {
  generateWithDiagram(input) {
    return this.generate(input, true);
  }

  generateFromPlan({
    llmPromptConfig,
    syllabus,
    topicId,
    categories,
    language,
    additionalInstructions = "",
    syllabusAdditionalInstructions = "",
    topicAdditionalInstructions = "",
  }) {
    if (!llmPromptConfig || !syllabus) {
      throw new Error("LLM prompt config and syllabus are required.");
    }

    const selectedLanguage = normalizeLanguage(language, syllabus);
    const topic = selectTopic(syllabus, topicId);
    const normalizedCategories = normalizeGenerationCategories(categories);
    const questionCount = normalizedCategories.reduce(
      (total, category) => total + category.numberOfQuestions,
      0,
    );
    const hasDiagramQuestions = normalizedCategories.some(
      ({ hasDiagram }) => hasDiagram,
    );
    const requirements = [
      "Question requirements",
      `Total number of questions: ${questionCount}`,
      `Language: ${selectedLanguage}`,
      `Subject: ${syllabus.subject}`,
      `Topic: ${topic.topicName}`,
      ...QUESTION_VARIETY_REQUIREMENTS,
      "Generate exactly the following question allocation:",
      ...normalizedCategories.map((category) => (
        `- ${category.numberOfQuestions} question(s): difficulty=\"${category.difficultyLevel}\", hasDiagram=${category.hasDiagram}`
      )),
      "The returned questions must match every allocation count exactly.",
      "Every question must include difficulty exactly matching one of the requested difficulty values.",
      "Every question must include hasDiagram as a JSON boolean.",
      "Questions with hasDiagram set to false must omit diagram.",
      "Each question must have exactly four options labelled a, b, c, and d.",
      "Each question must have exactly one correct answer.",
      "Every question must include an answerExplanation that adequately explains why the correct answer is correct.",
      "There is no word limit for answerExplanation; use as much explanation as needed for a clear and complete understanding.",
      "Use LaTeX for mathematical notation, with \\(...\\) for inline math and \\[...\\] for display math. Encode LaTeX backslashes correctly in JSON and do not use dollar-sign math delimiters.",
      `Every question must include topicName exactly equal to \"${topic.topicName}\".`,
    ];

    if (hasDiagramQuestions) {
      addDiagramRequirements(requirements);
    }

    const sample = normalizedCategories.find(({ hasDiagram }) => hasDiagram)
      || normalizedCategories[0];

    return buildPromptSections({
      llmPromptConfig,
      syllabus,
      topic,
      language: selectedLanguage,
      requirements,
      additionalInstructions,
      syllabusAdditionalInstructions,
      topicAdditionalInstructions,
      responseStructure: createLlmQuestionResponseStructure({
        includeDiagram: sample.hasDiagram,
        difficultyLevel: sample.difficultyLevel,
        language: selectedLanguage,
      }),
    });
  }

  generate({
    llmPromptConfig,
    syllabus,
    topicId,
    numberOfQuestions,
    difficultyLevel,
    language,
    additionalInstructions = "",
    avoidQuestionTexts = [],
    diagramQuestionPercentage = 0,
    syllabusAdditionalInstructions = "",
    topicAdditionalInstructions = "",
  }, includeDiagram = false) {
    if (!llmPromptConfig || !syllabus) {
      throw new Error("LLM prompt config and syllabus are required.");
    }

    const questionCount = normalizeQuestionCount(numberOfQuestions);
    const difficulty = requireText(difficultyLevel, "Difficulty level");
    const selectedLanguage = normalizeLanguage(language, syllabus);
    const topic = selectTopic(syllabus, topicId);
    const diagramPercentage = includeDiagram
      ? normalizeDiagramPercentage(diagramQuestionPercentage)
      : 0;
    const diagramCount = calculateDiagramQuestionCount(
      questionCount,
      diagramPercentage,
    );
    const requirements = [
      "Question requirements",
      `Number of questions: ${questionCount}`,
      `Difficulty level: ${difficulty}`,
      `Language: ${selectedLanguage}`,
      `Subject: ${syllabus.subject}`,
      `Topic: ${topic.topicName}`,
      ...QUESTION_VARIETY_REQUIREMENTS,
      "Each question must have exactly four options labelled a, b, c, and d.",
      "Each question must have exactly one correct answer.",
      "Every question must include hasDiagram as a JSON boolean.",
      "Every question must include an answerExplanation that adequately explains why the correct answer is correct.",
      "There is no word limit for answerExplanation; use as much explanation as needed for a clear and complete understanding.",
      "Use LaTeX for mathematical notation, with \\(...\\) for inline math and \\[...\\] for display math. Encode LaTeX backslashes correctly in JSON and do not use dollar-sign math delimiters.",
      `Every question must include topicName exactly equal to \"${topic.topicName}\".`,
    ];

    if (includeDiagram) {
      requirements.push(
        `Configured diagram question percentage: ${diagramPercentage}%.`,
        `Exactly ${diagramCount} of the ${questionCount} questions must set hasDiagram to true.`,
        `The remaining ${questionCount - diagramCount} questions must set hasDiagram to false and must omit diagram.`,
      );
    } else {
      requirements.push(
        "Every question must set hasDiagram to false and must omit diagram.",
      );
    }

    if (diagramCount > 0) {
      addDiagramRequirements(requirements);
    }

    return buildPromptSections({
      llmPromptConfig,
      syllabus,
      topic,
      language: selectedLanguage,
      requirements,
      additionalInstructions,
      syllabusAdditionalInstructions,
      topicAdditionalInstructions,
      responseStructure: createLlmQuestionResponseStructure({
        includeDiagram: diagramCount > 0,
        difficultyLevel: difficulty,
        language: selectedLanguage,
      }),
      avoidQuestionTexts,
    });
  }
}

module.exports = {
  createLlmQuestionResponseStructure,
  llmQuestionResponseFields,
  LlmPromptGenerator,
};
