const {requireTopicScope} = require("../domain/readiness_score");

class GetReadinessScoreHistory {
  constructor(repository) {
    this.repository = repository;
  }

  async execute(input) {
    return this.repository.listHistory(requireTopicScope(input));
  }
}

module.exports = {GetReadinessScoreHistory};

