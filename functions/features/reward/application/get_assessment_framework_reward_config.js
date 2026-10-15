const {requireFrameworkScope} = require("../domain/reward_config");
class GetAssessmentFrameworkRewardConfig {

  constructor(repository) { this.repository = repository; }
  async execute(input) { return this.repository.getFramework(requireFrameworkScope(input)); }
}

module.exports = {GetAssessmentFrameworkRewardConfig};
