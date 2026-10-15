import {requireStudentLoginScope} from "../domain/student_login.js?v=20261010-login-rewards-v1";

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

export {PruneStudentLoginHistory};
