function requireFunction(value, name) {
  if (typeof value !== "function") {
    throw new Error(`${name} must be a function.`);
  }

  return value;
}

function requireIdentifier(value, fieldName) {
  const identifier = String(value ?? "").trim();

  if (!identifier) {
    throw new Error(`${fieldName} is required.`);
  }

  return identifier;
}

function requireObject(value, fieldName) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${fieldName} must be an object.`);
  }

  return value;
}

export class GenerateAssessmentPractice {
  constructor({
    getStudentTopicLevel,
    getSyllabusAssessmentFrameworkId,
    getAssessmentLevelCriteria,
    getStudentSyllabusSubscriptionLanguage,
    getTopicDiagramPercentage,
    getDefaultLlmPromptConfig,
    allocateAssessmentQuestions,
    generateQuestions,
    generateQuestionsWithDiagram,
    assessmentPracticeType,
    assessmentFrameworkEndLevelId
  } = {}) {
    this.getStudentTopicLevel = requireFunction(
      getStudentTopicLevel,
      "getStudentTopicLevel"
    );
    this.getSyllabusAssessmentFrameworkId = requireFunction(
      getSyllabusAssessmentFrameworkId,
      "getSyllabusAssessmentFrameworkId"
    );
    this.getAssessmentLevelCriteria = requireFunction(
      getAssessmentLevelCriteria,
      "getAssessmentLevelCriteria"
    );
    this.getStudentSyllabusSubscriptionLanguage = requireFunction(
      getStudentSyllabusSubscriptionLanguage,
      "getStudentSyllabusSubscriptionLanguage"
    );
    this.getTopicDiagramPercentage = requireFunction(
      getTopicDiagramPercentage,
      "getTopicDiagramPercentage"
    );
    this.getDefaultLlmPromptConfig = requireFunction(
      getDefaultLlmPromptConfig,
      "getDefaultLlmPromptConfig"
    );
    this.allocateAssessmentQuestions = requireFunction(
      allocateAssessmentQuestions,
      "allocateAssessmentQuestions"
    );
    this.generateQuestions = requireFunction(
      generateQuestions,
      "generateQuestions"
    );
    this.generateQuestionsWithDiagram = requireFunction(
      generateQuestionsWithDiagram,
      "generateQuestionsWithDiagram"
    );
    this.assessmentPracticeType = requireIdentifier(
      assessmentPracticeType,
      "assessmentPracticeType"
    );
    this.assessmentFrameworkEndLevelId = requireIdentifier(
      assessmentFrameworkEndLevelId,
      "assessmentFrameworkEndLevelId"
    );
  }

  async generateQuestionSet({
    numberOfQuestions,
    hasDiagram,
    promptConfigId,
    syllabusId,
    topicId,
    difficultyLevel,
    language
  }) {
    if (numberOfQuestions === 0) {
      return Object.freeze({
        hasDiagram,
        numberOfQuestions: 0,
        prompts: Object.freeze([]),
        questions: Object.freeze([])
      });
    }

    const generator = hasDiagram
      ? this.generateQuestionsWithDiagram
      : this.generateQuestions;
    const result = requireObject(
      await generator(
        promptConfigId,
        syllabusId,
        {
          numberOfQuestions,
          difficultyLevel,
          language,
          group: this.assessmentPracticeType,
          topicId
        }
      ),
      "Question generation result"
    );
    const prompts = Array.isArray(result.prompts) ? result.prompts : [];
    const questions = Array.isArray(result.questions) ? result.questions : [];

    if (questions.length !== numberOfQuestions) {
      throw new Error(
        `Question generator returned ${questions.length} questions; `
        + `${numberOfQuestions} were requested.`
      );
    }

    return Object.freeze({
      hasDiagram,
      numberOfQuestions,
      prompts: Object.freeze([...prompts]),
      questions: Object.freeze([...questions])
    });
  }

  async execute(input = {}) {
    const studentId = requireIdentifier(input.studentId, "studentId");
    const syllabusId = requireIdentifier(input.syllabusId, "syllabusId");
    const topicId = requireIdentifier(input.topicId, "topicId");
    const [
      storedLevelId,
      storedAssessmentFrameworkId,
      storedLanguage,
      diagramPercentage,
      promptConfig
    ] = await Promise.all([
      this.getStudentTopicLevel({ studentId, syllabusId, topicId }),
      this.getSyllabusAssessmentFrameworkId(syllabusId),
      this.getStudentSyllabusSubscriptionLanguage(studentId, syllabusId),
      this.getTopicDiagramPercentage(syllabusId, topicId),
      this.getDefaultLlmPromptConfig()
    ]);
    const levelId = requireIdentifier(
      storedLevelId,
      "Student topic level"
    );

    if (levelId === this.assessmentFrameworkEndLevelId) {
      throw new Error(
        "The student has completed the assessment framework for this topic."
      );
    }

    const assessmentFrameworkId = requireIdentifier(
      storedAssessmentFrameworkId,
      "Syllabus assessment framework ID"
    );
    const language = requireIdentifier(
      storedLanguage,
      "Syllabus subscription language"
    );
    const promptConfigId = requireIdentifier(
      promptConfig?.id,
      "Default LLM prompt configuration ID"
    );
    const levelCriteria = requireObject(
      await this.getAssessmentLevelCriteria({
        assessmentFrameworkId,
        levelId
      }),
      "Assessment level criteria"
    );
    const criteria = requireObject(
      levelCriteria.criteria,
      "Assessment level criteria.criteria"
    );
    const difficultyLevel = requireIdentifier(
      criteria.difficultyLevel,
      "Assessment difficulty level"
    );
    const allocation = this.allocateAssessmentQuestions({
      numberOfQuestions: criteria.questionsPerPractice,
      diagramPercentage
    });
    const sharedGenerationInput = {
      promptConfigId,
      syllabusId,
      topicId,
      difficultyLevel,
      language
    };
    const withoutDiagram = await this.generateQuestionSet({
      ...sharedGenerationInput,
      numberOfQuestions: allocation.withoutDiagram,
      hasDiagram: false
    });
    const withDiagram = await this.generateQuestionSet({
      ...sharedGenerationInput,
      numberOfQuestions: allocation.withDiagram,
      hasDiagram: true
    });

    return Object.freeze({
      studentId,
      syllabusId,
      topicId,
      levelId,
      assessmentFrameworkId,
      language,
      difficultyLevel,
      levelCriteria,
      allocation,
      questionSets: Object.freeze({
        withoutDiagram,
        withDiagram
      }),
      prompts: Object.freeze([
        ...withoutDiagram.prompts,
        ...withDiagram.prompts
      ]),
      questions: Object.freeze([
        ...withoutDiagram.questions,
        ...withDiagram.questions
      ])
    });
  }
}
