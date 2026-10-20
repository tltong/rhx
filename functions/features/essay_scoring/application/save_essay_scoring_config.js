const {normalizeConfiguration, requireAdministratorUid} = require("../domain/essay_scoring_config");

class SaveEssayScoringConfig {
  constructor(repository, requireAdministrator) {Object.assign(this, {repository, requireAdministrator});}
  async execute(input, context) {
    const configuration = normalizeConfiguration(input);
    const administrator = await this.requireAdministrator(context);
    const saved = await this.repository.saveConfig({...configuration, updatedBy: requireAdministratorUid(administrator?.uid)},
      {beforeWrite: administrator.assertAccess});
    administrator.assertAccess?.();
    return saved;
  }
}
module.exports = {SaveEssayScoringConfig};
