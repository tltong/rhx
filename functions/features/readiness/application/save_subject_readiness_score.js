const {requireSubjectScope, requireReadinessScore, normalizeSourcePracticeId} = require("../domain/readiness_score");

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

module.exports = {SaveSubjectReadinessScore};
