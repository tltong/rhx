import {requireTopicScope} from "../domain/reliability_score.js?v=20261008-reliability-v1";

class GetTopicReliabilityScore {
  constructor(repository) {
    this.repository = repository;
  }

  async execute(input) {
    return this.repository.getTopic(requireTopicScope(input));
  }
}

export {GetTopicReliabilityScore};
