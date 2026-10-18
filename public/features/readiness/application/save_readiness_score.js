import {requireTopicScope, requireReadinessScore, normalizeSourcePracticeId, normalizeSourcePracticeType} from "../domain/readiness_score.js?v=20261018-essay-completion-metrics-v1";

class SaveReadinessScore {
  constructor(repository) {
    this.repository = repository;
  }

  async execute(input) {
    const scope = requireTopicScope(input);
    const score = requireReadinessScore(input.score);
    const practiceId = normalizeSourcePracticeId(input.practiceId);
    const practiceType = normalizeSourcePracticeType(input.practiceType);
    if (practiceType !== null && practiceId === null) throw new Error("practiceId is required with practiceType.");
    return this.repository.save({...scope, score, practiceId, ...(practiceType === null ? {} : {practiceType})});
  }
}

export {SaveReadinessScore};
