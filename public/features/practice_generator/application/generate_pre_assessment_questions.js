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

const DIFFICULTY_KEYS = Object.freeze(["easy", "medium", "hard"]);

export class GeneratePreAssessmentQuestions {
  constructor({
    allocatePreAssessmentQuestions,
    generatePlannedQuestions,
    preAssessmentGroup
  }) {
    this.allocatePreAssessmentQuestions = requireFunction(
      allocatePreAssessmentQuestions,
      "allocatePreAssessmentQuestions"
    );
    this.generatePlannedQuestions = requireFunction(
      generatePlannedQuestions,
      "generatePlannedQuestions"
    );
    this.preAssessmentGroup = requireIdentifier(
      preAssessmentGroup,
      "preAssessmentGroup"
    );
  }

  async execute(context) {
    if (!context?.preAssessment) {
      throw new Error("Pre-assessment generation context is required.");
    }

    const allocation = this.allocatePreAssessmentQuestions({
      numberOfQuestions: context.preAssessment.numberOfQuestions,
      difficultySplit: context.preAssessment.difficultySplit,
      diagramPercentage: context.diagramPercentage
    });
    const categories = DIFFICULTY_KEYS.flatMap((difficultyKey) => {
      const difficulty = allocation.byDifficulty[difficultyKey];

      return [
        {
          difficultyLevel: difficulty.difficultyLevel,
          hasDiagram: false,
          numberOfQuestions: difficulty.withoutDiagram
        },
        {
          difficultyLevel: difficulty.difficultyLevel,
          hasDiagram: true,
          numberOfQuestions: difficulty.withDiagram
        }
      ].filter((category) => category.numberOfQuestions > 0);
    });
    const result = await this.generatePlannedQuestions(
      context.promptConfig.id,
      context.syllabus.id,
      {
        categories,
        language: context.language,
        group: this.preAssessmentGroup,
        topicId: context.topic.id,
        additionalInstructions: ""
      }
    );

    return {
      allocation,
      categoryResults: categories,
      batches: result.batches,
      prompts: result.prompts,
      questions: result.questions
    };
  }
}
