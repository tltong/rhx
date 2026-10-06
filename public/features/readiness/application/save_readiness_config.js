import {
  normalizeReadinessConfigChanges,
  requireAdministratorUid
} from "../domain/readiness_config.js?v=20261006-readiness-feature-api-v1";

export class SaveReadinessConfig {
  constructor(readinessConfigRepository, requireAdministrator) {
    if (typeof requireAdministrator !== "function") {
      throw new Error("requireAdministrator is required.");
    }
    this.readinessConfigRepository = readinessConfigRepository;
    this.requireAdministrator = requireAdministrator;
  }

  async execute(input) {
    const changes = normalizeReadinessConfigChanges(input);
    const administrator = await this.requireAdministrator();
    return this.readinessConfigRepository.save({
      ...changes,
      updatedBy: requireAdministratorUid(administrator?.uid)
    });
  }
}
