import {requireConfigurationInput, requireAdministratorUid} from "../domain/reliability_config.js?v=20261008-reliability-v1";

class SaveReliabilityConfig {
  constructor(repository, requireAdministrator) {
    if (typeof requireAdministrator !== "function") {
      throw new Error("requireAdministrator is required.");
    }
    this.repository = repository;
    this.requireAdministrator = requireAdministrator;
  }

  async execute(input) {
    const configuration = requireConfigurationInput(input);
    const administrator = await this.requireAdministrator();
    return this.repository.save({
      ...configuration,
      updatedBy: requireAdministratorUid(administrator?.uid),
    });
  }
}

export {SaveReliabilityConfig};
