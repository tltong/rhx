const {requireSubjectScope, requireReadinessScore, normalizeSourcePracticeId, normalizeSourcePracticeType} = require("../domain/readiness_score");

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

module.exports = {SaveSubjectReadinessScore};
