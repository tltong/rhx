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

function toQuestionReference(question, questionNumber) {
  if (!question || typeof question !== "object") {
    throw new Error(`Generated question ${questionNumber} is invalid.`);
  }

  return {
    syllabusId: requireIdentifier(
      question.syllabusId,
      `Generated question ${questionNumber} syllabusId`
    ),
    topicId: requireIdentifier(
      question.topicId,
      `Generated question ${questionNumber} topicId`
    ),
    questionId: requireIdentifier(
      question.id,
      `Generated question ${questionNumber} id`
    )
  };
}

export class GeneratePreAssessmentPractice {
  constructor({
    loadPreAssessmentContext,
    generatePreAssessmentQuestions,
    createPractice,
    deletePractice,
    deletePreAssessmentQuestion,
    getPracticeById,
    assignTopicPreAssessmentPractice,
    preAssessmentPracticeType
  }) {
    this.loadPreAssessmentContext = requireFunction(
      loadPreAssessmentContext,
      "loadPreAssessmentContext"
    );
    this.generatePreAssessmentQuestions = requireFunction(
      generatePreAssessmentQuestions,
      "generatePreAssessmentQuestions"
    );
    this.createPractice = requireFunction(createPractice, "createPractice");
    this.deletePractice = requireFunction(deletePractice, "deletePractice");
    this.deletePreAssessmentQuestion = requireFunction(
      deletePreAssessmentQuestion,
      "deletePreAssessmentQuestion"
    );
    this.getPracticeById = requireFunction(
      getPracticeById,
      "getPracticeById"
    );
    this.assignTopicPreAssessmentPractice = requireFunction(
      assignTopicPreAssessmentPractice,
      "assignTopicPreAssessmentPractice"
    );
    this.preAssessmentPracticeType = requireIdentifier(
      preAssessmentPracticeType,
      "preAssessmentPracticeType"
    );
  }

  async loadPreviousPractice(context) {
    if (!context.existingAssignment) {
      return null;
    }

    const previousPractice = await this.getPracticeById(
      context.existingAssignment.practiceId
    );

    if (
      previousPractice
      && previousPractice.type !== this.preAssessmentPracticeType
    ) {
      throw new Error(
        "Existing topic assignment does not reference a pre-assessment practice."
      );
    }

    return previousPractice;
  }

  async deletePreviousPractice(context, previousPractice) {
    if (!context.existingAssignment) {
      return {
        replaced: false,
        previousPracticeId: null,
        deletedQuestionCount: 0
      };
    }

    const previousPracticeId = context.existingAssignment.practiceId;

    if (!previousPractice) {
      return {
        replaced: true,
        previousPracticeId,
        deletedQuestionCount: 0
      };
    }

    await this.deletePractice(previousPractice.id);

    const questionReferences = previousPractice.questions || [];

    await Promise.all(questionReferences.map((question) => (
      this.deletePreAssessmentQuestion(
        question.syllabusId,
        question.topicId,
        question.questionId
      )
    )));

    return {
      replaced: true,
      previousPracticeId,
      deletedQuestionCount: questionReferences.length
    };
  }

  async execute(input = {}) {
    const context = await this.loadPreAssessmentContext(input);
    const previousPractice = await this.loadPreviousPractice(context);
    const generation = await this.generatePreAssessmentQuestions(
      context
    );
    const questionReferences = generation.questions.map(
      (question, index) => toQuestionReference(question, index + 1)
    );

    if (
      questionReferences.length !== generation.allocation.totalQuestions
    ) {
      throw new Error(
        "Generated question count does not match the pre-assessment allocation."
      );
    }

    const practice = await this.createPractice({
      type: this.preAssessmentPracticeType,
      questions: questionReferences
    });
    const assignment = await this.assignTopicPreAssessmentPractice(
      context.syllabus.id,
      context.topic.id,
      context.language,
      practice.id
    );
    const replacement = await this.deletePreviousPractice(
      context,
      previousPractice
    );

    return {
      practice,
      assignment,
      replacement,
      syllabusId: context.syllabus.id,
      topicId: context.topic.id,
      topicName: context.topic.topicName,
      language: context.language,
      allocation: generation.allocation,
      categoryResults: generation.categoryResults,
      batches: generation.batches,
      prompts: generation.prompts,
      questions: generation.questions
    };
  }
}
