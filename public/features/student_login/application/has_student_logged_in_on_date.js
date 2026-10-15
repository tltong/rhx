import {requireStudentLoginDateScope} from "../domain/student_login.js?v=20261010-login-rewards-v1";

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

export {HasStudentLoggedInOnDate};
