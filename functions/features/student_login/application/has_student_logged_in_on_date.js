const {requireStudentLoginDateScope} = require("../domain/student_login");

class HasStudentLoggedInOnDate {
  constructor(repository, authorize = () => {}) {
    this.repository = repository;
    this.authorize = authorize;
  }
  async execute(input) {
    const normalized = requireStudentLoginDateScope(input);
    await this.authorize(normalized);
    return this.repository.hasLoggedInOnDate(normalized);
  }
}

module.exports = {HasStudentLoggedInOnDate};
