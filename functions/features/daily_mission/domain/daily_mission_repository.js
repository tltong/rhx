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

  async isTopicPaused(input) {
    throw new Error("isTopicPaused() is not implemented.");
  }

  async pauseTopic(input) {
    throw new Error("pauseTopic() is not implemented.");
  }

  async unpauseTopic(input) {
    throw new Error("unpauseTopic() is not implemented.");
  }

  async getCoreMission(input) {
    throw new Error("getCoreMission() is not implemented.");
  }

  async isPracticeCompleted(input) {
    throw new Error("isPracticeCompleted() is not implemented.");
  }

  async listAcceptedAdditionalPracticeIds(input) {
    throw new Error("listAcceptedAdditionalPracticeIds() is not implemented.");
  }

  async listAcceptedAdditionalTopicIds(input) {
    throw new Error("listAcceptedAdditionalTopicIds() is not implemented.");
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
