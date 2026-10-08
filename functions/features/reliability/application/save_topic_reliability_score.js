const {requireTopicScope, requireReliabilityScore, requireCompletedPracticeCount} = require("../domain/reliability_score");

class SaveTopicReliabilityScore {
  constructor(repository) {
    this.repository = repository;
  }

  async execute(input) {
    return this.repository.saveTopic({
      ...requireTopicScope(input),
      score: requireReliabilityScore(input.score),
      completedPracticeCount: requireCompletedPracticeCount(input.completedPracticeCount),
    });
  }
}

module.exports = {SaveTopicReliabilityScore};
