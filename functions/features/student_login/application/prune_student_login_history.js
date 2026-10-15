const {requireStudentLoginScope} = require("../domain/student_login");

class PruneStudentLoginHistory {
  constructor(repository, authorize = () => {}) {
    this.repository = repository;
    this.authorize = authorize;
  }
  async execute(input) {
    const normalized = requireStudentLoginScope(input);
    await this.authorize(normalized);
    return this.repository.pruneHistory(normalized);
  }
}

module.exports = {PruneStudentLoginHistory};
