import {requireTopicScope, requireReadinessScore, normalizeSourcePracticeId} from "../domain/readiness_score.js?v=20261007-readiness-completion-v1";

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

export {SaveReadinessScore};
