const {requireSubjectScope} = require("../domain/readiness_score");

class GetSubjectReadinessScore {
  constructor(repository) {
    this.repository = repository;
  }

  async execute(input) {
    return this.repository.getSubject(requireSubjectScope(input));
  }
}

module.exports = {GetSubjectReadinessScore};
