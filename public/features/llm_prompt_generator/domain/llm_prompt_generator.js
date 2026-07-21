/**
 * Inputs supplied by a caller when generating an LLM prompt.
 *
 * @typedef {Object} LlmPromptGenerationInput
 * @property {number} numberOfQuestions
 * @property {string} difficultyLevel
 * @property {string} language
 * @property {string[]} [topicIds]
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

function selectTopics(syllabus, topicIds) {
  const topics = Array.isArray(syllabus.topics) ? syllabus.topics : [];
  const selectedTopicIds = normalizeTopicIds(topicIds);

  if (selectedTopicIds.length === 0) {
    return topics;
  }

  const selectedTopicIdSet = new Set(selectedTopicIds);
  const selectedTopics = topics.filter((topic) => (
    selectedTopicIdSet.has(topic.id)
  ));

  if (selectedTopics.length !== selectedTopicIds.length) {
    throw new Error("One or more selected topics do not belong to the syllabus.");
  }

  return selectedTopics;
}

function formatTopics(topics) {
  if (topics.length === 0) {
    return "- No topics are defined. Cover the subject at the specified level and year.";
  }

  return topics
    .map((topic, topicIndex) => {
      const topicName = requireText(topic.topicName, "Topic name");
      const subtopicNames = Object.values(topic.subtopics || {})
        .map(normalizeText)
        .filter(Boolean);
      const lines = [`${topicIndex + 1}. ${topicName}`];

      subtopicNames.forEach((subtopicName) => {
        lines.push(`   - ${subtopicName}`);
      });

      return lines.join("\n");
    })
    .join("\n");
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

  generate({
    llmPromptConfig,
    syllabus,
    topicIds = [],
    numberOfQuestions,
    difficultyLevel,
    language,
    additionalInstructions = ""
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
    const topics = selectTopics(syllabus, topicIds);
    const callerInstructions = normalizeText(additionalInstructions);

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
    const topicAttributionInstruction = topics.length > 0
      ? "Every question must include topicName, exactly matching one of the syllabus topic names."
      : "Every question must include topicName with the most appropriate topic for that question.";
    const questionRequirements = [
      "Question requirements",
      `Number of questions: ${questionCount}`,
      `Difficulty level: ${difficulty}`,
      `Language: ${selectedLanguage}`,
      "Each question must have exactly four options labelled a, b, c, and d.",
      "Each question must have exactly one correct answer.",
      `Every question must include hasDiagram as a JSON boolean set to ${includeDiagram}.`,
      "Every question must include an answerExplanation that adequately explains why the correct answer is correct.",
      "There is no word limit for answerExplanation; use as much explanation as needed for a clear and complete understanding.",
      topicAttributionInstruction
    ];

    if (includeDiagram) {
      questionRequirements.push(
        "Every question must include one diagram, and that diagram must be the primary source of information needed to answer the question.",
        "The question text is only for brief context or supporting explanation and must not provide enough information to answer without interpreting the diagram.",
        "The options and correct answer must be based primarily on information shown in the diagram.",
        "The answerExplanation must refer to the relevant information shown in the diagram.",
        "Generate every diagram from valid Mermaid source.",
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
        `Subject: ${subject}`
      ].join("\n"),
      `Topics and subtopics:\n${formatTopics(topics)}`,
      questionRequirements.join("\n"),
      `Configured instructions:\n${formatInstructionSections(configInstructions)}`
    ];

    if (callerInstructions) {
      sections.push(`Request-specific additional instructions:\n${callerInstructions}`);
    }

    sections.push([
      "Response format",
      "Return only valid JSON using this structure:",
      JSON.stringify(
        createLlmQuestionResponseStructure({
          includeDiagram,
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
