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

function requireBoolean(value, fieldName) {
  if (typeof value !== "boolean") {
    throw new Error(`${fieldName} must be a boolean.`);
  }

  return value;
}

function normalizeLanguage(value) {
  return requireIdentifier(value, "language").toLocaleLowerCase();
}

function toQuestionReference(question, fieldName = "question") {
  const source = requireObject(question, fieldName);

  return Object.freeze({
    syllabusId: requireIdentifier(
      source.syllabusId,
      `${fieldName}.syllabusId`,
    ),
    topicId: requireIdentifier(source.topicId, `${fieldName}.topicId`),
    language: requireIdentifier(source.language, `${fieldName}.language`),
    hasDiagram: requireBoolean(
      source.hasDiagram,
      `${fieldName}.hasDiagram`,
    ),
    questionId: requireIdentifier(
      source.questionId ?? source.id,
      `${fieldName}.questionId`,
    ),
  });
}

function getQuestionReferenceKey(question, fieldName = "question") {
  const reference = toQuestionReference(question, fieldName);

  return JSON.stringify([
    reference.syllabusId,
    reference.topicId,
    normalizeLanguage(reference.language),
    reference.hasDiagram,
    reference.questionId,
  ]);
}

function isReferenceForTopic(
  questionReference,
  {syllabusId, topicId, language},
) {
  return questionReference?.syllabusId === syllabusId
    && questionReference?.topicId === topicId
    && typeof questionReference?.hasDiagram === "boolean"
    && normalizeLanguage(questionReference?.language) === normalizeLanguage(
      language,
    );
}

class GenerateAssessmentPractice {
  constructor({
    getStudentTopicLevel,
    getSyllabusAssessmentFrameworkId,
    getAssessmentLevelCriteria,
    getStudentSyllabusSubscriptionLanguage,
    getTopicDiagramPercentage,
    getDefaultLlmPromptConfig,
    allocateAssessmentQuestions,
    listQuestionsByTopic,
    getQuestionsForPractice,
    listAssignedPracticeIds,
    listCompletedPracticeIds,
    getPracticeById,
    generateQuestions,
    generateQuestionsWithDiagram,
    createPractice,
    deletePractice,
    assignPracticeToStudent,
    assessmentPracticeType,
    assessmentFrameworkEndLevelId,
  } = {}) {
    this.getStudentTopicLevel = requireFunction(
      getStudentTopicLevel,
      "getStudentTopicLevel",
    );
    this.getSyllabusAssessmentFrameworkId = requireFunction(
      getSyllabusAssessmentFrameworkId,
      "getSyllabusAssessmentFrameworkId",
    );
    this.getAssessmentLevelCriteria = requireFunction(
      getAssessmentLevelCriteria,
      "getAssessmentLevelCriteria",
    );
    this.getStudentSyllabusSubscriptionLanguage = requireFunction(
      getStudentSyllabusSubscriptionLanguage,
      "getStudentSyllabusSubscriptionLanguage",
    );
    this.getTopicDiagramPercentage = requireFunction(
      getTopicDiagramPercentage,
      "getTopicDiagramPercentage",
    );
    this.getDefaultLlmPromptConfig = requireFunction(
      getDefaultLlmPromptConfig,
      "getDefaultLlmPromptConfig",
    );
    this.allocateAssessmentQuestions = requireFunction(
      allocateAssessmentQuestions,
      "allocateAssessmentQuestions",
    );
    this.listQuestionsByTopic = requireFunction(
      listQuestionsByTopic,
      "listQuestionsByTopic",
    );
    this.getQuestionsForPractice = requireFunction(
      getQuestionsForPractice,
      "getQuestionsForPractice",
    );
    this.listAssignedPracticeIds = requireFunction(
      listAssignedPracticeIds,
      "listAssignedPracticeIds",
    );
    this.listCompletedPracticeIds = requireFunction(
      listCompletedPracticeIds,
      "listCompletedPracticeIds",
    );
    this.getPracticeById = requireFunction(
      getPracticeById,
      "getPracticeById",
    );
    this.generateQuestions = requireFunction(
      generateQuestions,
      "generateQuestions",
    );
    this.generateQuestionsWithDiagram = requireFunction(
      generateQuestionsWithDiagram,
      "generateQuestionsWithDiagram",
    );
    this.createPractice = requireFunction(createPractice, "createPractice");
    this.deletePractice = requireFunction(deletePractice, "deletePractice");
    this.assignPracticeToStudent = requireFunction(
      assignPracticeToStudent,
      "assignPracticeToStudent",
    );
    this.assessmentPracticeType = requireIdentifier(
      assessmentPracticeType,
      "assessmentPracticeType",
    );
    this.assessmentFrameworkEndLevelId = requireIdentifier(
      assessmentFrameworkEndLevelId,
      "assessmentFrameworkEndLevelId",
    );
  }

  async loadUsedQuestionKeys({
    studentId,
    syllabusId,
    topicId,
    language,
  }) {
    const [assignedPracticeIds, completedPracticeIds] = await Promise.all([
      this.listAssignedPracticeIds({studentId}),
      this.listCompletedPracticeIds({studentId}),
    ]);
    const practiceIds = [...new Set([
      ...(Array.isArray(assignedPracticeIds) ? assignedPracticeIds : []),
      ...(Array.isArray(completedPracticeIds) ? completedPracticeIds : []),
    ])];
    const practices = await Promise.all(
      practiceIds.map((practiceId) => this.getPracticeById(practiceId)),
    );
    const questionReferences = [];
    const referenceKeys = new Set();

    practices.forEach((practice) => {
      if (
        !practice
        || practice.type !== this.assessmentPracticeType
        || !Array.isArray(practice.questions)
      ) {
        return;
      }

      practice.questions.forEach((questionReference) => {
        if (!isReferenceForTopic(questionReference, {
          syllabusId,
          topicId,
          language,
        })) {
          return;
        }

        const key = getQuestionReferenceKey(
          questionReference,
          "practice question",
        );

        if (!referenceKeys.has(key)) {
          referenceKeys.add(key);
          questionReferences.push(toQuestionReference(
            questionReference,
            "practice question",
          ));
        }
      });
    });

    if (questionReferences.length === 0) {
      return new Set();
    }

    const usedQuestions = await this.getQuestionsForPractice(
      questionReferences,
    );

    return new Set(usedQuestions.map((question, index) => (
      getQuestionReferenceKey(question, `used question ${index + 1}`)
    )));
  }

  async loadReusableQuestionSets({
    studentId,
    syllabusId,
    topicId,
    language,
    difficultyLevel,
    allocation,
  }) {
    const listQuestions = (hasDiagram, numberOfQuestions) => (
      numberOfQuestions === 0
        ? Promise.resolve([])
        : this.listQuestionsByTopic(syllabusId, topicId, {
          language,
          hasDiagram,
          difficulty: difficultyLevel,
          group: this.assessmentPracticeType,
        })
    );
    const [usedQuestionKeys, withoutDiagram, withDiagram] = await Promise.all([
      this.loadUsedQuestionKeys({
        studentId,
        syllabusId,
        topicId,
        language,
      }),
      listQuestions(false, allocation.withoutDiagram),
      listQuestions(true, allocation.withDiagram),
    ]);
    const selectUnused = (questions, numberOfQuestions) => (
      questions
        .filter((question, index) => !usedQuestionKeys.has(
          getQuestionReferenceKey(
            question,
            `candidate question ${index + 1}`,
          ),
        ))
        .slice(0, numberOfQuestions)
    );

    return Object.freeze({
      withoutDiagram: Object.freeze(selectUnused(
        withoutDiagram,
        allocation.withoutDiagram,
      )),
      withDiagram: Object.freeze(selectUnused(
        withDiagram,
        allocation.withDiagram,
      )),
    });
  }

  async generateQuestionSet({
    numberOfQuestions,
    reusableQuestions = [],
    hasDiagram,
    promptConfigId,
    syllabusId,
    topicId,
    difficultyLevel,
    language,
  }) {
    const reusedQuestions = reusableQuestions.slice(0, numberOfQuestions);
    const numberToGenerate = numberOfQuestions - reusedQuestions.length;

    if (numberToGenerate === 0) {
      return Object.freeze({
        hasDiagram,
        numberOfQuestions,
        reusedQuestionCount: reusedQuestions.length,
        generatedQuestionCount: 0,
        prompts: Object.freeze([]),
        questions: Object.freeze([...reusedQuestions]),
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
          numberOfQuestions: numberToGenerate,
          difficultyLevel,
          language,
          group: this.assessmentPracticeType,
          topicId,
        },
      ),
      "Question generation result",
    );
    const prompts = Array.isArray(result.prompts) ? result.prompts : [];
    const questions = Array.isArray(result.questions) ? result.questions : [];

    if (questions.length !== numberToGenerate) {
      throw new Error(
        `Question generator returned ${questions.length} questions; `
        + `${numberToGenerate} were requested.`,
      );
    }

    return Object.freeze({
      hasDiagram,
      numberOfQuestions,
      reusedQuestionCount: reusedQuestions.length,
      generatedQuestionCount: questions.length,
      prompts: Object.freeze([...prompts]),
      questions: Object.freeze([...reusedQuestions, ...questions]),
    });
  }

  async createAndAssignPractice(studentId, questions) {
    const practice = await this.createPractice({
      type: this.assessmentPracticeType,
      questions: questions.map((question, index) => (
        toQuestionReference(question, `question ${index + 1}`)
      )),
    });

    try {
      const assignment = await this.assignPracticeToStudent({
        studentId,
        practiceId: practice.id,
      });

      return Object.freeze({practice, assignment});
    } catch (error) {
      try {
        await this.deletePractice(practice.id);
      } catch (cleanupError) {
        const assignmentError = error instanceof Error
          ? error
          : new Error(String(error));

        assignmentError.practiceCleanupError = cleanupError;
        throw assignmentError;
      }

      throw error;
    }
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
    ] = await Promise.all([
      this.getStudentTopicLevel({studentId, syllabusId, topicId}),
      this.getSyllabusAssessmentFrameworkId(syllabusId),
      this.getStudentSyllabusSubscriptionLanguage(studentId, syllabusId),
      this.getTopicDiagramPercentage(syllabusId, topicId),
    ]);
    const levelId = requireIdentifier(
      storedLevelId,
      "Student topic level",
    );

    if (levelId === this.assessmentFrameworkEndLevelId) {
      throw new Error(
        "The student has completed the assessment framework for this topic.",
      );
    }

    const assessmentFrameworkId = requireIdentifier(
      storedAssessmentFrameworkId,
      "Syllabus assessment framework ID",
    );
    const language = requireIdentifier(
      storedLanguage,
      "Syllabus subscription language",
    );
    const levelCriteria = requireObject(
      await this.getAssessmentLevelCriteria({
        assessmentFrameworkId,
        levelId,
      }),
      "Assessment level criteria",
    );
    const criteria = requireObject(
      levelCriteria.criteria,
      "Assessment level criteria.criteria",
    );
    const difficultyLevel = requireIdentifier(
      criteria.difficultyLevel,
      "Assessment difficulty level",
    );
    const allocation = this.allocateAssessmentQuestions({
      numberOfQuestions: criteria.questionsPerPractice,
      diagramPercentage,
    });
    const reusableQuestionSets = await this.loadReusableQuestionSets({
      studentId,
      syllabusId,
      topicId,
      language,
      difficultyLevel,
      allocation,
    });
    const numberToGenerate = allocation.totalQuestions
      - reusableQuestionSets.withoutDiagram.length
      - reusableQuestionSets.withDiagram.length;
    const promptConfigId = numberToGenerate > 0
      ? requireIdentifier(
        (await this.getDefaultLlmPromptConfig())?.id,
        "Default LLM prompt configuration ID",
      )
      : null;
    const sharedGenerationInput = {
      promptConfigId,
      syllabusId,
      topicId,
      difficultyLevel,
      language,
    };
    const withoutDiagram = await this.generateQuestionSet({
      ...sharedGenerationInput,
      numberOfQuestions: allocation.withoutDiagram,
      reusableQuestions: reusableQuestionSets.withoutDiagram,
      hasDiagram: false,
    });
    const withDiagram = await this.generateQuestionSet({
      ...sharedGenerationInput,
      numberOfQuestions: allocation.withDiagram,
      reusableQuestions: reusableQuestionSets.withDiagram,
      hasDiagram: true,
    });
    const questions = Object.freeze([
      ...withoutDiagram.questions,
      ...withDiagram.questions,
    ]);
    const {
      practice,
      assignment,
    } = await this.createAndAssignPractice(studentId, questions);

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
      practice,
      assignment,
      questionSets: Object.freeze({
        withoutDiagram,
        withDiagram,
      }),
      prompts: Object.freeze([
        ...withoutDiagram.prompts,
        ...withDiagram.prompts,
      ]),
      questions,
    });
  }
}

module.exports = {
  GenerateAssessmentPractice,
};
