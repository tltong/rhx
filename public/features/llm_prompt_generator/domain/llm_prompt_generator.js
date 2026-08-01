/**
 * Inputs supplied by a caller when generating an LLM prompt.
 *
 * @typedef {Object} LlmPromptGenerationInput
 * @property {number} numberOfQuestions
 * @property {string} difficultyLevel
 * @property {string} language
 * @property {string} topicId
 * @property {string} [additionalInstructions]
 */

/**
 * One category in a mixed question-generation plan.
 *
 * @typedef {Object} LlmQuestionGenerationCategory
 * @property {number} numberOfQuestions
 * @property {string} difficultyLevel
 * @property {boolean} hasDiagram
 */

/**
 * Inputs supplied for a mixed question-generation prompt.
 *
 * @typedef {Object} LlmPromptGenerationPlanInput
 * @property {LlmQuestionGenerationCategory[]} categories
 * @property {string} language
 * @property {string} topicId
 * @property {string} [additionalInstructions]
 */

export const llmQuestionResponseFields = Object.freeze({
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
  language: "language"
});

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
  return requireText(value, "Difficulty level");
}

function normalizeLanguage(value, syllabus) {
  const requestedLanguage = requireText(value, "Language");
  const syllabusLanguages = Array.isArray(syllabus.languages)
    ? syllabus.languages.map(normalizeText).filter(Boolean)
    : [];

  if (syllabusLanguages.length === 0) {
    throw new Error("The selected syllabus does not define any languages.");
  }

  const language = syllabusLanguages.find(
    (item) => item.toLowerCase() === requestedLanguage.toLowerCase()
  );

  if (!language) {
    throw new Error("Language must be available on the selected syllabus.");
  }

  return language;
}

function selectTopic(syllabus, topicId) {
  const topics = Array.isArray(syllabus.topics) ? syllabus.topics : [];
  const selectedTopicId = requireText(topicId, "Topic");
  const selectedTopic = topics.find(
    (topic) => String(topic.id) === selectedTopicId
  );

  if (!selectedTopic) {
    throw new Error("The selected topic does not belong to the syllabus.");
  }

  return selectedTopic;
}

function formatTopic(topic) {
  const topicName = requireText(topic.topicName, "Topic name");
  const subtopicNames = Object.values(topic.subtopics || {})
    .map(normalizeText)
    .filter(Boolean);
  const lines = [`Topic: ${topicName}`];

  if (subtopicNames.length === 0) {
    lines.push("Subtopics: None defined.");
  } else {
    lines.push("Subtopics:");
    subtopicNames.forEach((subtopicName) => {
      lines.push(`- ${subtopicName}`);
    });
  }

  return lines.join("\n");
}

function normalizeDiagramPercentage(value) {
  const percentage = Number(value);

  if (
    !Number.isFinite(percentage)
    || percentage < 0
    || percentage > 100
  ) {
    throw new Error(
      "Diagram question percentage must be between 0 and 100."
    );
  }

  return percentage;
}

function calculateDiagramQuestionCount(questionCount, percentage) {
  if (percentage === 0) {
    return 0;
  }

  return Math.min(
    questionCount,
    Math.max(1, Math.round(questionCount * percentage / 100))
  );
}

function normalizeGenerationCategories(categories) {
  if (!Array.isArray(categories) || categories.length === 0) {
    throw new Error("At least one question category is required.");
  }

  const categoryKeys = new Set();

  return categories.map((category, index) => {
    if (!category || typeof category !== "object" || Array.isArray(category)) {
      throw new Error(`Question category ${index + 1} must be an object.`);
    }

    const difficultyLevel = normalizeDifficulty(category.difficultyLevel);
    const numberOfQuestions = normalizeQuestionCount(
      category.numberOfQuestions
    );

    if (typeof category.hasDiagram !== "boolean") {
      throw new Error(
        `Question category ${index + 1} hasDiagram must be a boolean.`
      );
    }

    const key = [
      difficultyLevel.toLowerCase(),
      category.hasDiagram
    ].join("|");

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

function getConfigInstructions(llmPromptConfig, level, year) {
  const levelContext = level === "primary"
    ? llmPromptConfig.primaryContext
    : llmPromptConfig.secondaryContext;
  const yearInstructions = llmPromptConfig[level]?.[String(year)]
    ?.additionalInstructions;

  return [
    ["Level context", levelContext],
    ["Year-specific instructions", yearInstructions],
    [
      "Overall additional instructions",
      llmPromptConfig.overallAdditionalInstructions
    ]
  ].filter(([, value]) => normalizeText(value));
}

function formatInstructionSections(instructions) {
  if (instructions.length === 0) {
    return "No additional prompt-config instructions are defined.";
  }

  return instructions
    .map(([heading, value]) => `${heading}:\n${normalizeText(value)}`)
    .join("\n\n");
}

export function createLlmQuestionResponseStructure({
  includeDiagram = false,
  difficultyLevel = "...",
  language = "..."
} = {}) {
  const fields = llmQuestionResponseFields;
  const question = {
    [fields.questionText]: "...",
    [fields.topicName]: "...",
    [fields.hasDiagram]: includeDiagram === true
  };

  if (includeDiagram === true) {
    question[fields.diagram] = {
      [fields.mermaidCode]: "..."
    };
  }

  question[fields.options] = {
    a: "...",
    b: "...",
    c: "...",
    d: "..."
  };
  question[fields.correctAnswer] = "a";
  question[fields.answerExplanation] = "...";
  question[fields.difficulty] = normalizeText(difficultyLevel) || "...";
  question[fields.language] = normalizeText(language) || "...";

  return {
    [fields.questions]: [question]
  };
}

export class LlmPromptGenerator {
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
    topicAdditionalInstructions = ""
  }) {
    if (!llmPromptConfig) {
      throw new Error("LLM prompt config is required.");
    }

    if (!syllabus) {
      throw new Error("Syllabus is required.");
    }

    const country = requireText(syllabus.country, "Syllabus country");
    const level = requireText(syllabus.level, "Syllabus level").toLowerCase();
    const year = Number(syllabus.year);
    const subject = requireText(syllabus.subject, "Syllabus subject");
    const selectedLanguage = normalizeLanguage(language, syllabus);
    const topic = selectTopic(syllabus, topicId);
    const topicName = requireText(topic.topicName, "Topic name");
    const callerInstructions = normalizeText(additionalInstructions);
    const syllabusInstructions = normalizeText(
      syllabusAdditionalInstructions
    );
    const topicInstructions = normalizeText(topicAdditionalInstructions);
    const normalizedCategories = normalizeGenerationCategories(categories);
    const questionCount = normalizedCategories.reduce(
      (total, category) => total + category.numberOfQuestions,
      0
    );
    const hasDiagramQuestions = normalizedCategories.some(
      (category) => category.hasDiagram
    );

    if (!Number.isInteger(year) || year < 1) {
      throw new Error("Syllabus year must be a positive integer.");
    }

    if (!Object.prototype.hasOwnProperty.call(llmPromptConfig, level)) {
      throw new Error("Syllabus level must be primary or secondary.");
    }

    const configInstructions = getConfigInstructions(
      llmPromptConfig,
      level,
      year
    );
    const categoryLines = normalizedCategories.map((category) => (
      `- ${category.numberOfQuestions} question(s): `
      + `difficulty="${category.difficultyLevel}", `
      + `hasDiagram=${category.hasDiagram}`
    ));
    const questionRequirements = [
      "Question requirements",
      `Total number of questions: ${questionCount}`,
      `Language: ${selectedLanguage}`,
      `Subject: ${subject}`,
      `Topic: ${topicName}`,
      "Generate exactly the following question allocation:",
      ...categoryLines,
      "The returned questions must match every allocation count exactly.",
      "Every question must include difficulty exactly matching one of the requested difficulty values.",
      "Every question must include hasDiagram as a JSON boolean.",
      "Questions with hasDiagram set to false must omit diagram.",
      "Each question must have exactly four options labelled a, b, c, and d.",
      "Each question must have exactly one correct answer.",
      "Every question must include an answerExplanation that adequately explains why the correct answer is correct.",
      "There is no word limit for answerExplanation; use as much explanation as needed for a clear and complete understanding.",
      `Every question must include topicName exactly equal to "${topicName}".`
    ];

    if (hasDiagramQuestions) {
      questionRequirements.push(
        "Every question with hasDiagram set to true must include one diagram, and that diagram must be the primary source of information needed to answer the question.",
        "For a diagram question, the question text is only for brief context or supporting explanation and must not provide enough information to answer without interpreting the diagram.",
        "For a diagram question, the options and correct answer must be based primarily on information shown in the diagram.",
        "For a diagram question, answerExplanation must refer to the relevant information shown in the diagram.",
        "Generate each required diagram from valid Mermaid source.",
        "Choose the Mermaid diagram type and syntax best suited to each question; diagrams are not limited to flowcharts.",
        "Use only Mermaid 11 diagram types supported by the renderer, such as flowchart, sequenceDiagram, classDiagram, stateDiagram-v2, erDiagram, mindmap, timeline, pie, or xychart-beta.",
        "For bar or line charts, use xychart-beta syntax; never use bar as a Mermaid diagram type.",
        "Return the Mermaid source in diagram.mermaidCode as a correctly escaped JSON string.",
        "Encode Mermaid line breaks with JSON \\n escapes exactly once; after JSON parsing, mermaidCode must contain actual line breaks rather than literal backslash-n text.",
        "Do not return SVG; the application will render and sanitize the Mermaid source.",
        "Mermaid source must not contain configuration directives, click actions, links, scripts, HTML tags, icons, images, or Markdown code fences."
      );
    }

    const sections = [
      "Generate educational multiple-choice questions using the requirements below.",
      [
        "Syllabus",
        `Country: ${country}`,
        `Level: ${level}`,
        `Year: ${year}`,
        `Subject: ${subject}`,
        `Topic: ${topicName}`
      ].join("\n"),
      `Selected topic and subtopics:\n${formatTopic(topic)}`,
      questionRequirements.join("\n"),
      `Configured instructions:\n${formatInstructionSections(configInstructions)}`
    ];

    if (syllabusInstructions) {
      sections.push(
        `Syllabus-specific additional instructions:\n${syllabusInstructions}`
      );
    }

    if (topicInstructions) {
      sections.push(
        `Topic-specific additional instructions:\n${topicInstructions}`
      );
    }

    if (callerInstructions) {
      sections.push(`Request-specific additional instructions:\n${callerInstructions}`);
    }

    const sampleCategory = normalizedCategories.find(
      (category) => category.hasDiagram
    ) || normalizedCategories[0];

    sections.push([
      "Response format",
      "Return only valid JSON using this structure:",
      JSON.stringify(
        createLlmQuestionResponseStructure({
          includeDiagram: sampleCategory.hasDiagram,
          difficultyLevel: sampleCategory.difficultyLevel,
          language: selectedLanguage
        }),
        null,
        2
      )
    ].join("\n"));

    return sections.join("\n\n");
  }

  generate({
    llmPromptConfig,
    syllabus,
    topicId,
    numberOfQuestions,
    difficultyLevel,
    language,
    additionalInstructions = "",
    diagramQuestionPercentage = 0,
    syllabusAdditionalInstructions = "",
    topicAdditionalInstructions = ""
  }, includeDiagram = false) {
    if (!llmPromptConfig) {
      throw new Error("LLM prompt config is required.");
    }

    if (!syllabus) {
      throw new Error("Syllabus is required.");
    }

    const country = requireText(syllabus.country, "Syllabus country");
    const level = requireText(syllabus.level, "Syllabus level").toLowerCase();
    const year = Number(syllabus.year);
    const subject = requireText(syllabus.subject, "Syllabus subject");
    const questionCount = normalizeQuestionCount(numberOfQuestions);
    const difficulty = normalizeDifficulty(difficultyLevel);
    const selectedLanguage = normalizeLanguage(language, syllabus);
    const topic = selectTopic(syllabus, topicId);
    const topicName = requireText(topic.topicName, "Topic name");
    const callerInstructions = normalizeText(additionalInstructions);
    const syllabusInstructions = normalizeText(
      syllabusAdditionalInstructions
    );
    const topicInstructions = normalizeText(topicAdditionalInstructions);
    const diagramPercentage = includeDiagram
      ? normalizeDiagramPercentage(diagramQuestionPercentage)
      : 0;
    const diagramQuestionCount = calculateDiagramQuestionCount(
      questionCount,
      diagramPercentage
    );
    const hasDiagramQuestions = diagramQuestionCount > 0;

    if (!Number.isInteger(year) || year < 1) {
      throw new Error("Syllabus year must be a positive integer.");
    }

    if (!Object.prototype.hasOwnProperty.call(llmPromptConfig, level)) {
      throw new Error("Syllabus level must be primary or secondary.");
    }

    const configInstructions = getConfigInstructions(
      llmPromptConfig,
      level,
      year
    );
    const questionRequirements = [
      "Question requirements",
      `Number of questions: ${questionCount}`,
      `Difficulty level: ${difficulty}`,
      `Language: ${selectedLanguage}`,
      `Subject: ${subject}`,
      `Topic: ${topicName}`,
      "Each question must have exactly four options labelled a, b, c, and d.",
      "Each question must have exactly one correct answer.",
      "Every question must include hasDiagram as a JSON boolean.",
      "Every question must include an answerExplanation that adequately explains why the correct answer is correct.",
      "There is no word limit for answerExplanation; use as much explanation as needed for a clear and complete understanding.",
      `Every question must include topicName exactly equal to "${topicName}".`
    ];

    if (includeDiagram) {
      questionRequirements.push(
        `Configured diagram question percentage: ${diagramPercentage}%.`,
        `Exactly ${diagramQuestionCount} of the ${questionCount} questions must set hasDiagram to true.`,
        `The remaining ${questionCount - diagramQuestionCount} questions must set hasDiagram to false and must omit diagram.`
      );
    } else {
      questionRequirements.push(
        "Every question must set hasDiagram to false and must omit diagram."
      );
    }

    if (hasDiagramQuestions) {
      questionRequirements.push(
        "Every question with hasDiagram set to true must include one diagram, and that diagram must be the primary source of information needed to answer the question.",
        "For a diagram question, the question text is only for brief context or supporting explanation and must not provide enough information to answer without interpreting the diagram.",
        "For a diagram question, the options and correct answer must be based primarily on information shown in the diagram.",
        "For a diagram question, answerExplanation must refer to the relevant information shown in the diagram.",
        "Generate each required diagram from valid Mermaid source.",
        "Choose the Mermaid diagram type and syntax best suited to each question; diagrams are not limited to flowcharts.",
        "Use only Mermaid 11 diagram types supported by the renderer, such as flowchart, sequenceDiagram, classDiagram, stateDiagram-v2, erDiagram, mindmap, timeline, pie, or xychart-beta.",
        "For bar or line charts, use xychart-beta syntax; never use bar as a Mermaid diagram type.",
        "Return the Mermaid source in diagram.mermaidCode as a correctly escaped JSON string.",
        "Encode Mermaid line breaks with JSON \\n escapes exactly once; after JSON parsing, mermaidCode must contain actual line breaks rather than literal backslash-n text.",
        "Do not return SVG; the application will render and sanitize the Mermaid source.",
        "Mermaid source must not contain configuration directives, click actions, links, scripts, HTML tags, icons, images, or Markdown code fences."
      );
    }

    const sections = [
      "Generate educational multiple-choice questions using the requirements below.",
      [
        "Syllabus",
        `Country: ${country}`,
        `Level: ${level}`,
        `Year: ${year}`,
        `Subject: ${subject}`,
        `Topic: ${topicName}`
      ].join("\n"),
      `Selected topic and subtopics:\n${formatTopic(topic)}`,
      questionRequirements.join("\n"),
      `Configured instructions:\n${formatInstructionSections(configInstructions)}`
    ];

    if (syllabusInstructions) {
      sections.push(
        `Syllabus-specific additional instructions:\n${syllabusInstructions}`
      );
    }

    if (topicInstructions) {
      sections.push(
        `Topic-specific additional instructions:\n${topicInstructions}`
      );
    }

    if (callerInstructions) {
      sections.push(`Request-specific additional instructions:\n${callerInstructions}`);
    }

    sections.push([
      "Response format",
      "Return only valid JSON using this structure:",
      JSON.stringify(
        createLlmQuestionResponseStructure({
          includeDiagram: hasDiagramQuestions,
          difficultyLevel: difficulty,
          language: selectedLanguage
        }),
        null,
        2
      )
    ].join("\n"));

    return sections.join("\n\n");
  }
}
