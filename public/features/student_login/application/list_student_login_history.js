import {requireStudentLoginHistoryInput} from "../domain/student_login.js?v=20261010-login-rewards-v1";

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

export {ListStudentLoginHistory};
