const {
  normalizeReadinessConfigChanges,
  requireAdministratorUid,
} = require("../domain/readiness_config");

class SaveReadinessConfig {
  constructor(readinessConfigRepository) {
    this.readinessConfigRepository = readinessConfigRepository;
  }

  async execute(input, {updatedBy} = {}) {
    return this.readinessConfigRepository.save({
      ...normalizeReadinessConfigChanges(input),
      updatedBy: requireAdministratorUid(updatedBy),
    });
  }
}

module.exports = {SaveReadinessConfig};
