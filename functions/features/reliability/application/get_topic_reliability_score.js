const {requireTopicScope} = require("../domain/reliability_score");

class GetTopicReliabilityScore {
  constructor(repository) {
    this.repository = repository;
  }

  async execute(input) {
    return this.repository.getTopic(requireTopicScope(input));
  }
}

module.exports = {GetTopicReliabilityScore};
