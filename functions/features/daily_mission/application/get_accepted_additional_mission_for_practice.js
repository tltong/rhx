const {requireAcceptedDailyMissionScope} = require("../domain/accepted_daily_mission");

class GetAcceptedAdditionalMissionForPractice {
  constructor({dailyMissionRepository} = {}) {
    if (typeof dailyMissionRepository?.getAcceptedAdditionalMissionForPractice !== "function") {
      throw new Error("dailyMissionRepository is required.");
    }
    this.dailyMissionRepository = dailyMissionRepository;
  }

  async execute(input) {
    const scope = requireAcceptedDailyMissionScope(input);
    return this.dailyMissionRepository.getAcceptedAdditionalMissionForPractice(scope);
  }
}

module.exports = {GetAcceptedAdditionalMissionForPractice};
