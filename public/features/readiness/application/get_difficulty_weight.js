import {
  normalizeDifficultyLevel
} from "../domain/readiness_config.js?v=20261006-readiness-feature-api-v1";

export class GetDifficultyWeight {
  constructor(getReadinessConfig) {
    this.getReadinessConfig = getReadinessConfig;
  }

  async execute(difficultyLevel) {
    const difficulty = normalizeDifficultyLevel(difficultyLevel);
    const config = await this.getReadinessConfig();
    if (!config) {
      const error = new Error("Readiness weights have not been configured.");
      error.code = "failed-precondition";
      throw error;
    }
    return config.difficultyWeights[difficulty];
  }
}
