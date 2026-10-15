const {requireStudentLoginHistoryInput} = require("../domain/student_login");

class ListStudentLoginHistory {
  constructor(repository, authorize = () => {}) {
    this.repository = repository;
    this.authorize = authorize;
  }
  async execute(input) {
    const normalized = requireStudentLoginHistoryInput(input);
    await this.authorize(normalized);
    return this.repository.listHistory(normalized);
  }
}

module.exports = {ListStudentLoginHistory};
