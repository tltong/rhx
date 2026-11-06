import {normalizeConfiguration, requireAdministratorUid} from "../domain/essay_scoring_config.js?v=20261104-fill-preassessment-v3";

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
export {SaveEssayScoringConfig};
