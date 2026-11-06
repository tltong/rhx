import {assessmentFrameworkTypes} from "../../../config/firebase/assessment_framework_schema.js?v=20261104-fill-preassessment-v3";
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
    scoreLevelSplit = {},
    difficultyLevel
  }, frameworkType = "normal") {
    if (frameworkType === "fillInTheBlanks") {
      this.difficultyLevel = String(difficultyLevel ?? "medium").toLowerCase();
      if (!["easy", "medium", "hard"].includes(this.difficultyLevel)) throw new Error("Unknown pre-assessment difficulty.");
      this.scoreLevelSplit = scoreLevelSplit; return;
    }
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
    if (this.frameworkType === "fillInTheBlanks") {
      if (this.preAssessment) {
        this.preAssessment = new AssessmentFrameworkPreAssessment(this.preAssessment, this.frameworkType);
        const ids = new Set([...this.levels.map(level => level.id), "endLevel"]);
        for (const field of ["under40Percent", "over40Percent", "over50Percent", "over60Percent", "over70Percent", "over80Percent", "over90Percent"]) {
          if (!ids.has(this.preAssessment.scoreLevelSplit[field])) throw new Error("scoreLevelSplit." + field + " references an unknown level.");
        }
      }
      for (const level of this.levels) {
        const c = level.criteria;
        if (!Number.isSafeInteger(c?.requiredPracticeCount) || c.requiredPracticeCount < 1 || !Number.isFinite(c.minimumScore) || c.minimumScore < 0 || c.minimumScore > 100
            || !["easy", "medium", "hard"].includes(String(c.difficultyLevel).toLowerCase())) throw new Error("Fill-in-the-blanks levels require a positive passage count, score 0-100 and a valid difficulty.");
      }
      return;
    }
    if (this.frameworkType !== "essay") return;
    if (this.preAssessment) throw new Error("Essay frameworks do not use pre-assessment.");
    for (const level of this.levels) {
      const criteria = level.criteria;
      if (!Number.isInteger(criteria?.requiredPracticeCount) || criteria.requiredPracticeCount < 1 || !Number.isFinite(criteria.minimumScore) || criteria.minimumScore < 0 || criteria.minimumScore > 100
          || criteria.questionsPerPractice !== 1 || !["easy", "medium", "hard"].includes(String(criteria.difficultyLevel).toLowerCase())) throw new Error("Essay levels require a positive essay count, score 0-100, and one question with Easy, Medium or Hard difficulty.");
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
