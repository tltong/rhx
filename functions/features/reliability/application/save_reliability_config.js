const {requireConfigurationInput, requireAdministratorUid} = require("../domain/reliability_config");

class SaveReliabilityConfig {
  constructor(repository) {
    this.repository = repository;
  }

  async execute(input, {updatedBy} = {}) {
    return this.repository.save({
      ...requireConfigurationInput(input),
      updatedBy: requireAdministratorUid(updatedBy),
    });
  }
}

module.exports = {SaveReliabilityConfig};
