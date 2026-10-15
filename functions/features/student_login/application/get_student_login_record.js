const {requireStudentLoginDateScope} = require("../domain/student_login");

class GetStudentLoginRecord {
  constructor(repository, authorize = () => {}) {
    this.repository = repository;
    this.authorize = authorize;
  }
  async execute(input) {
    const scope = requireStudentLoginDateScope(input);
    await this.authorize(scope);
    return this.repository.getByDate(scope);
  }
}

module.exports = {GetStudentLoginRecord};
