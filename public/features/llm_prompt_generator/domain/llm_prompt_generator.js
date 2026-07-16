export const llmPromptDifficultyLevels = Object.freeze({
  EASY: "Easy",
  MEDIUM: "Medium",
  HARD: "Hard"
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
  const requestedDifficulty = normalizeText(value).toLowerCase();
  const difficulty = Object.values(llmPromptDifficultyLevels).find(
    (level) => level.toLowerCase() === requestedDifficulty
  );

  if (!difficulty) {
    throw new Error("Difficulty level must be Easy, Medium, or Hard.");
  }

  return difficulty;
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
  const selectedTopics = topics.filter((topic) => selectedTopicIdSet.has(topic.id));
  const foundTopicIds = new Set(selectedTopics.map((topic) => topic.id));
  const missingTopicIds = selectedTopicIds.filter(
    (topicId) => !foundTopicIds.has(topicId)
  );

  if (missingTopicIds.length > 0) {
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

export class LlmPromptGenerator {
  generate({
    llmPromptConfig,
    syllabus,
    topicIds = [],
    numberOfQuestions,
    difficultyLevel,
    additionalInstructions = ""
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
    const questionCount = normalizeQuestionCount(numberOfQuestions);
    const difficulty = normalizeDifficulty(difficultyLevel);
    const selectedTopics = selectTopics(syllabus, topicIds);
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
    const topicAttributionInstruction = selectedTopics.length > 0
      ? "Every question must include topicName, exactly matching one of the selected syllabus topic names."
      : "Every question must include topicName with the most appropriate topic for that question.";
    const sections = [
      "Generate educational multiple-choice questions using the requirements below.",
      [
        "Syllabus",
        `Country: ${country}`,
        `Level: ${level}`,
        `Year: ${year}`,
        `Subject: ${subject}`
      ].join("\n"),
      `Topics and subtopics:\n${formatTopics(selectedTopics)}`,
      [
        "Question requirements",
        `Number of questions: ${questionCount}`,
        `Difficulty level: ${difficulty}`,
        "Each question must have exactly four options labelled a, b, c, and d.",
        "Each question must have exactly one correct answer.",
        topicAttributionInstruction
      ].join("\n"),
      `Configured instructions:\n${formatInstructionSections(configInstructions)}`
    ];

    if (callerInstructions) {
      sections.push(`Request-specific additional instructions:\n${callerInstructions}`);
    }

    sections.push([
      "Response format",
      "Return only valid JSON using this structure:",
      "{",
      '  "questions": [',
      "    {",
      '      "questionText": "...",',
      '      "topicName": "...",',
      '      "options": { "a": "...", "b": "...", "c": "...", "d": "..." },',
      '      "correctAnswer": "a",',
      `      "difficulty": "${difficulty}"`,
      "    }",
      "  ]",
      "}"
    ].join("\n"));

    return sections.join("\n\n");
  }
}
