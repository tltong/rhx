const {requireSubjectScope} = require("../domain/readiness_score");

class GetSubjectReadinessScoreHistory {
  constructor(repository) {
    this.repository = repository;
  }

  async execute(input) {
    return this.repository.listSubjectHistory(requireSubjectScope(input));
  }
}

module.exports = {GetSubjectReadinessScoreHistory};
