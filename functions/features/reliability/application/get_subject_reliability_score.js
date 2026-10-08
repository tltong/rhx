const {requireSubjectScope} = require("../domain/reliability_score");

class GetSubjectReliabilityScore {
  constructor(repository) {
    this.repository = repository;
  }

  async execute(input) {
    return this.repository.getSubject(requireSubjectScope(input));
  }
}

module.exports = {GetSubjectReliabilityScore};
