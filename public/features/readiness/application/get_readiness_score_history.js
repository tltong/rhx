import {requireTopicScope} from "../domain/readiness_score.js?v=20261007-readiness-completion-v1";

class GetReadinessScoreHistory {
  constructor(repository) {
    this.repository = repository;
  }

  async execute(input) {
    return this.repository.listHistory(requireTopicScope(input));
  }
}

export {GetReadinessScoreHistory};
