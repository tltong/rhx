const {normalizeConfiguration, requireAdministratorUid} = require("../domain/question_seed_generator_config");

class SaveQuestionSeedGeneratorConfig {
  constructor(repository, requireAdministrator) {
    this.repository = repository;
    this.requireAdministrator = requireAdministrator;
  }

  async execute(input, context) {
    const configuration = normalizeConfiguration(input);
    const administrator = await this.requireAdministrator(context);
    const saved = await this.repository.saveConfig({
      ...configuration, updatedBy: requireAdministratorUid(administrator?.uid),
    }, {beforeWrite: administrator.assertAccess});
    administrator.assertAccess?.();
    return saved;
  }
}

module.exports = {SaveQuestionSeedGeneratorConfig};
