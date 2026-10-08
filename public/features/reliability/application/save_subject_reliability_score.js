import {requireSubjectScope, requireReliabilityScore} from "../domain/reliability_score.js?v=20261008-reliability-v1";

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

export {SaveSubjectReliabilityScore};
