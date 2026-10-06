const {requireTopicScope} = require("../domain/readiness_score");

class GetReadinessScore {
  constructor(repository) {
    this.repository = repository;
  }

  async execute(input) {
    return this.repository.get(requireTopicScope(input));
  }
}

module.exports = {GetReadinessScore};

