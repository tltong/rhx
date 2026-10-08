import {requireSubjectScope} from "../domain/readiness_score.js?v=20261008-subject-readiness-v1";

class GetSubjectReadinessScore {
  constructor(repository) {
    this.repository = repository;
  }

  async execute(input) {
    return this.repository.getSubject(requireSubjectScope(input));
  }
}

export {GetSubjectReadinessScore};
