import {requireAcceptedDailyMissionScope} from "../domain/accepted_daily_mission.js?v=20261018-essay-session-v1";

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

export {GetAcceptedDailyMissionForPractice};
