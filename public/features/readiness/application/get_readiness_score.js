import {requireTopicScope} from "../domain/readiness_score.js?v=20261104-fill-firestore-v2";

class GetReadinessScore {
  constructor(repository) {
    this.repository = repository;
  }

  async execute(input) {
    return this.repository.get(requireTopicScope(input));
  }
}

export {GetReadinessScore};
