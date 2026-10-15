import {requireFrameworkScope} from "../domain/reward_config.js?v=20261013-recent-reward-activities-v1";
class GetAssessmentFrameworkRewardConfig {

  constructor(repository) { this.repository = repository; }
  async execute(input) { return this.repository.getFramework(requireFrameworkScope(input)); }
}

export {GetAssessmentFrameworkRewardConfig};
