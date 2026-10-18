import {assessmentFrameworkTypes} from "../../../config/firebase/assessment_framework_schema.js?v=20261018-topic-framework-v1";
export class AssessmentFrameworkLevel {
  constructor({
    id,
    levelName,
    sequenceOrder,
    criteria = {}
  }) {
    this.id = id;
    this.levelName = levelName;
    this.sequenceOrder = sequenceOrder;
    this.criteria = criteria;
  }

  update({
    levelName,
    sequenceOrder,
    criteria
  }) {
    if (levelName !== undefined) {
      this.levelName = levelName;
    }

    if (sequenceOrder !== undefined) {
      this.sequenceOrder = sequenceOrder;
    }

    if (criteria !== undefined) {
      this.criteria = criteria;
    }

    return this;
  }
}

export class AssessmentFrameworkPreAssessment {
  constructor({
    numberOfQuestions,
    difficultySplit = {},
    scoreLevelSplit = {}
  }) {
    this.numberOfQuestions = numberOfQuestions;
    this.difficultySplit = difficultySplit;
    this.scoreLevelSplit = scoreLevelSplit;
  }
}

export class AssessmentFramework {
  constructor({
    id = null,
    name,
    frameworkType = assessmentFrameworkTypes.NORMAL,
    endLevelName,
    levels = [],
    preAssessment = null
  }) {
    this.id = id;
    if (!Object.values(assessmentFrameworkTypes).includes(frameworkType)) throw new Error("Unknown assessment framework type.");
    this.frameworkType = frameworkType;
    this.name = name;
    this.endLevelName = endLevelName;
    this.levels = levels;
    this.preAssessment = preAssessment;
    this.validateEssayCriteria();
  }

  validateEssayCriteria() {
    if (this.frameworkType !== "essay") return;
    if (this.preAssessment) throw new Error("Essay frameworks do not use pre-assessment.");
    for (const level of this.levels) {
      const criteria = level.criteria;
      if (!Number.isInteger(criteria?.requiredPracticeCount) || criteria.requiredPracticeCount < 1 || !Number.isFinite(criteria.minimumScore) || criteria.minimumScore < 0 || criteria.minimumScore > 100
          || criteria.questionsPerPractice !== 1 || String(criteria.difficultyLevel).toLowerCase() !== "medium") throw new Error("Essay levels require a positive essay count, score 0-100, and one medium-difficulty question.");
    }
  }

  update({
    name,
    frameworkType,
    endLevelName,
    levels,
    preAssessment
  }) {
    if (frameworkType !== undefined && frameworkType !== this.frameworkType) throw new Error("Create a new framework to change its type.");
    if (name !== undefined) {
      this.name = name;
    }

    if (endLevelName !== undefined) {
      this.endLevelName = endLevelName;
    }

    if (levels !== undefined) {
      this.levels = levels;
    }

    if (preAssessment !== undefined) {
      this.preAssessment = preAssessment;
    }

    return this;
  }
}
