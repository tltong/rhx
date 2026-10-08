import {requireTopicScope, requireReliabilityScore, requireCompletedPracticeCount} from "../domain/reliability_score.js?v=20261008-reliability-v1";

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

export {SaveTopicReliabilityScore};
