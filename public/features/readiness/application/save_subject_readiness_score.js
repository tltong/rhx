import {requireSubjectScope, requireReadinessScore, normalizeSourcePracticeId} from "../domain/readiness_score.js?v=20261008-subject-readiness-v1";

class SaveSubjectReadinessScore {
  constructor(repository) {
    this.repository = repository;
  }

  async execute(input) {
    const scope = requireSubjectScope(input);
    const score = requireReadinessScore(input.score);
    const practiceId = normalizeSourcePracticeId(input.practiceId);
    return this.repository.saveSubject({...scope, score, practiceId});
  }
}

export {SaveSubjectReadinessScore};
