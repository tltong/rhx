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
    endLevelName,
    levels = [],
    preAssessment = null
  }) {
    this.id = id;
    this.name = name;
    this.endLevelName = endLevelName;
    this.levels = levels;
    this.preAssessment = preAssessment;
  }

  update({
    name,
    endLevelName,
    levels,
    preAssessment
  }) {
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
