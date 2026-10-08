import {requireSubjectScope} from "../domain/reliability_score.js?v=20261008-reliability-v1";

class GetSubjectReliabilityScore {
  constructor(repository) {
    this.repository = repository;
  }

  async execute(input) {
    return this.repository.getSubject(requireSubjectScope(input));
  }
}

export {GetSubjectReliabilityScore};
