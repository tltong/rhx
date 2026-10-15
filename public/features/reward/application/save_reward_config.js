import {requireConfigurationInput, requireAdministratorUid} from "../domain/reward_config.js?v=20261013-recent-reward-activities-v1";
class SaveRewardConfig {

  constructor(repository, requireAdministrator) {
    this.repository = repository;
    this.requireAdministrator = requireAdministrator;
  }
  async execute(input, context) {
    const configuration = requireConfigurationInput(input);
    const administrator = await this.requireAdministrator(context);
    return this.repository.saveGlobal({...configuration, updatedBy: requireAdministratorUid(administrator?.uid)});
  }
}

export {SaveRewardConfig};
