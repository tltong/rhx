import {requireSubjectScope, requireReadinessScore, normalizeSourcePracticeId, normalizeSourcePracticeType} from "../domain/readiness_score.js?v=20261018-essay-completion-metrics-v1";

class SaveSubjectReadinessScore {
  constructor(repository) {
    this.repository = repository;
  }

  async execute(input) {
    const scope = requireSubjectScope(input);
    const score = requireReadinessScore(input.score);
    const practiceId = normalizeSourcePracticeId(input.practiceId);
    const practiceType = normalizeSourcePracticeType(input.practiceType);
    if (practiceType !== null && practiceId === null) throw new Error("practiceId is required with practiceType.");
    return this.repository.saveSubject({...scope, score, practiceId, ...(practiceType === null ? {} : {practiceType})});
  }
}

export {SaveSubjectReadinessScore};
