const {requireSubjectScope, requireReliabilityScore} = require("../domain/reliability_score");

class SaveSubjectReliabilityScore {
  constructor(repository) {
    this.repository = repository;
  }

  async execute(input) {
    return this.repository.saveSubject({
      ...requireSubjectScope(input),
      score: requireReliabilityScore(input.score),
    });
  }
}

module.exports = {SaveSubjectReliabilityScore};
