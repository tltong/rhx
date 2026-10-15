import {requireStudentLoginDateScope} from "../domain/student_login.js?v=20261010-login-rewards-v1";

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

export {GetStudentLoginRecord};
