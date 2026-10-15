const {requireConfigurationInput, requireAdministratorUid} = require("../domain/tutor_config");

class SaveTutorConfig {
  constructor(repository, requireAdministrator) {
    if (typeof requireAdministrator !== "function") {
      throw new Error("requireAdministrator is required.");
    }
    this.repository = repository;
    this.requireAdministrator = requireAdministrator;
  }

  async execute(input, context) {
    // Capture and validate all caller data before awaiting administrator checks.
    const configuration = requireConfigurationInput(input);
    const administrator = await this.requireAdministrator(context);
    return this.repository.save({
      ...configuration, updatedBy: requireAdministratorUid(administrator?.uid),
    });
  }
}

module.exports = {SaveTutorConfig};

