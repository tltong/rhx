const {requireStudentLoginScope} = require("../domain/student_login");

class RecordStudentLogin {
  constructor(repository, authorize = () => {}) {
    this.repository = repository;
    this.authorize = authorize;
  }
  async execute(input) {
    const normalized = requireStudentLoginScope(input);
    await this.authorize(normalized);
    return this.repository.record(normalized);
  }
}

module.exports = {RecordStudentLogin};
