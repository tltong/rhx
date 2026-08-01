function requireIdentifier(value, fieldName) {
  const identifier = String(value ?? "").trim();

  if (!identifier) {
    throw new Error(`${fieldName} is required.`);
  }

  return identifier;
}

function requireFunction(value, name) {
  if (typeof value !== "function") {
    throw new Error(`${name} must be a function.`);
  }

  return value;
}

export class LoadPreAssessmentContext {
  constructor({
    getSyllabusById,
    getAssessmentFrameworkById,
    getDiagramConfigForSyllabus,
    getDefaultLlmPromptConfig,
    getTopicPreAssessmentPractice
  }) {
    this.getSyllabusById = requireFunction(
      getSyllabusById,
      "getSyllabusById"
    );
    this.getAssessmentFrameworkById = requireFunction(
      getAssessmentFrameworkById,
      "getAssessmentFrameworkById"
    );
    this.getDiagramConfigForSyllabus = requireFunction(
      getDiagramConfigForSyllabus,
      "getDiagramConfigForSyllabus"
    );
    this.getDefaultLlmPromptConfig = requireFunction(
      getDefaultLlmPromptConfig,
      "getDefaultLlmPromptConfig"
    );
    this.getTopicPreAssessmentPractice = requireFunction(
      getTopicPreAssessmentPractice,
      "getTopicPreAssessmentPractice"
    );
  }

  async execute(input = {}) {
    const syllabusId = requireIdentifier(input.syllabusId, "syllabusId");
    const topicId = requireIdentifier(input.topicId, "topicId");
    const requestedLanguage = requireIdentifier(input.language, "language");
    const syllabus = await this.getSyllabusById(syllabusId);

    if (!syllabus) {
      throw new Error("Syllabus could not be found.");
    }

    const topic = (syllabus.topics || []).find(
      (item) => item.id === topicId
    );

    if (!topic) {
      throw new Error("Topic does not belong to the selected syllabus.");
    }

    const language = (syllabus.languages || []).find(
      (item) => (
        String(item).trim().toLowerCase() ===
        requestedLanguage.toLowerCase()
      )
    );

    if (!language) {
      throw new Error("Language is not available for the selected syllabus.");
    }

    const assessmentFrameworkId = requireIdentifier(
      syllabus.assessmentFrameworkId,
      "syllabus.assessmentFrameworkId"
    );
    const [
      assessmentFramework,
      diagramResult,
      promptConfig,
      existingAssignment
    ] = await Promise.all([
      this.getAssessmentFrameworkById(assessmentFrameworkId),
      this.getDiagramConfigForSyllabus(syllabusId),
      this.getDefaultLlmPromptConfig(),
      this.getTopicPreAssessmentPractice(syllabusId, topicId, language)
    ]);

    if (!assessmentFramework) {
      throw new Error("Assessment framework could not be found.");
    }

    if (!assessmentFramework.preAssessment) {
      throw new Error(
        "Assessment framework pre-assessment settings are not configured."
      );
    }

    if (!promptConfig?.id) {
      throw new Error("Default LLM prompt configuration could not be found.");
    }

    const diagramTopicConfig = diagramResult?.config?.topics?.find(
      (item) => item.topicId === topicId
    );

    if (!diagramTopicConfig) {
      throw new Error("Diagram configuration for the topic could not be found.");
    }

    return {
      syllabus,
      topic,
      language,
      assessmentFramework,
      preAssessment: assessmentFramework.preAssessment,
      diagramPercentage: diagramTopicConfig.isDiagramApplicable
        ? diagramTopicConfig.diagramQuestionPercentage
        : 0,
      promptConfig,
      existingAssignment
    };
  }
}
