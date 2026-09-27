class DailyMissionRepository {
  async acceptAdditionalMission(input) {
    throw new Error("acceptAdditionalMission() is not implemented.");
  }

  async acceptCoreMission(input) {
    throw new Error("acceptCoreMission() is not implemented.");
  }

  async checkPausedTopicValidity(input) {
    throw new Error("checkPausedTopicValidity() is not implemented.");
  }

  async pauseTopic(input) {
    throw new Error("pauseTopic() is not implemented.");
  }

  async getCoreMission(input) {
    throw new Error("getCoreMission() is not implemented.");
  }

  async listAcceptedAdditionalPracticeIds(input) {
    throw new Error("listAcceptedAdditionalPracticeIds() is not implemented.");
  }

  async listPausedTopicIds(input) {
    throw new Error("listPausedTopicIds() is not implemented.");
  }

  async listTopicStats(input) {
    throw new Error("listTopicStats() is not implemented.");
  }
}

module.exports = {
  DailyMissionRepository,
};
