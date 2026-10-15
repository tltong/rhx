import {requireFrameworkConfigurationInput, requireCurrentFrameworkLevels, requireAdministratorUid} from "../domain/reward_config.js?v=20261013-recent-reward-activities-v1";
class SaveAssessmentFrameworkRewardConfig {

  constructor(repository, {requireAdministrator, getAssessmentFrameworkById, endLevelId}) {
    this.repository = repository;
    this.requireAdministrator = requireAdministrator;
    this.getAssessmentFrameworkById = getAssessmentFrameworkById;
    this.endLevelId = endLevelId;
  }
  async execute(input, context) {
    const configuration = requireFrameworkConfigurationInput(input);
    const framework = await this.getAssessmentFrameworkById(configuration.assessmentFrameworkId);
    requireCurrentFrameworkLevels(configuration.levelCoins, framework, this.endLevelId);
    const administrator = await this.requireAdministrator(context);
    return this.repository.saveFramework({...configuration, updatedBy: requireAdministratorUid(administrator?.uid)});
  }
}

export {SaveAssessmentFrameworkRewardConfig};
