const {requireTopicScope, requireReadinessScore, normalizeSourcePracticeId} = require("../domain/readiness_score");

class SaveReadinessScore {
  constructor(repository) {
    this.repository = repository;
  }

  async execute(input) {
    const scope = requireTopicScope(input);
    const score = requireReadinessScore(input.score);
    const practiceId = normalizeSourcePracticeId(input.practiceId);
    return this.repository.save({...scope, score, practiceId});
  }
}

module.exports = {SaveReadinessScore};
