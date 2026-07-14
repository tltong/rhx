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

export class AssessmentFramework {
  constructor({
    id = null,
    name,
    endLevelName,
    levels = []
  }) {
    this.id = id;
    this.name = name;
    this.endLevelName = endLevelName;
    this.levels = levels;
  }

  update({
    name,
    endLevelName,
    levels
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

    return this;
  }
}
