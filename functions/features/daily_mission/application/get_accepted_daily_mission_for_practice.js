const {requireAcceptedDailyMissionScope} = require("../domain/accepted_daily_mission");

class GetAcceptedDailyMissionForPractice {
  constructor({dailyMissionRepository} = {}) {
    if (typeof dailyMissionRepository?.getAcceptedDailyMissionForPractice !== "function") {
      throw new Error("dailyMissionRepository is required.");
    }
    this.dailyMissionRepository = dailyMissionRepository;
  }

  async execute(input) {
    const scope = requireAcceptedDailyMissionScope(input);
    return this.dailyMissionRepository.getAcceptedDailyMissionForPractice(scope);
  }
}

module.exports = {GetAcceptedDailyMissionForPractice};
