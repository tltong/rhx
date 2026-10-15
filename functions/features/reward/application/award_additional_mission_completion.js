const {DEFAULT_REWARD_CONFIG, RewardCategory} = require("../../../schema/reward_schema");
const {requireStudentRewardPracticeScope, requireMatchingAward} = require("../domain/student_reward");
const {requireCoinValue} = require("../domain/reward_config");
const {createAdditionalMissionRewardId} = require("../domain/additional_mission_reward_id");

class AwardAdditionalMissionCompletion {
  constructor({studentRewardRepository, getAcceptedAdditionalMissionForPractice,
    listCompletedPracticeIds, getRewardConfig, authorizeWrite = () => {}} = {}) {
    if (typeof studentRewardRepository?.getById !== "function" || typeof studentRewardRepository?.save !== "function"
        || typeof getAcceptedAdditionalMissionForPractice !== "function" || typeof listCompletedPracticeIds !== "function"
        || typeof getRewardConfig !== "function" || typeof authorizeWrite !== "function") {
      throw new Error("Additional mission reward dependencies are required.");
    }
    Object.assign(this, {studentRewardRepository, getAcceptedAdditionalMissionForPractice, listCompletedPracticeIds, getRewardConfig, authorizeWrite});
  }

  async execute(input) {
    const scope = requireStudentRewardPracticeScope(input);
    await this.authorizeWrite();
    const mission = await this.getAcceptedAdditionalMissionForPractice(scope);
    if (mission === null) return null;
    if (mission?.practiceId !== scope.practiceId) throw new Error("The accepted mission does not match the requested practice.");
    const completedIds = await this.listCompletedPracticeIds({studentId: scope.studentId});
    if (!completedIds.includes(scope.practiceId)) {
      const error = new Error("The accepted additional mission practice has not been completed.");
      error.code = "failed-precondition";
      throw error;
    }

    const awardScope = {
      studentId: scope.studentId, categoryId: RewardCategory.BONUS_MISSION_COMPLETION,
      awardId: await createAdditionalMissionRewardId(mission),
    };
    const base = {
      ...awardScope, sourceId: scope.practiceId,
      details: {
        missionDate: mission.missionDate, syllabusId: mission.syllabusId,
        topicId: mission.topicId, practiceId: scope.practiceId,
      },
    };
    const existing = await this.studentRewardRepository.getById(awardScope);
    if (existing !== null) return this.resumeAward(existing, base);

    const config = await this.getRewardConfig() ?? DEFAULT_REWARD_CONFIG;
    try {
      return await this.saveAward({
        ...base, coins: requireCoinValue(config.bonusMissionCompletionCoins, "bonusMissionCompletionCoins"),
      });
    } catch (error) {
      if (error.code !== "already-exists") throw error;
      // The first committed award fixes the amount, including concurrent calls
      // that observed different configs and retries after a final read failed.
      const saved = await this.studentRewardRepository.getById(awardScope);
      if (saved === null) throw error;
      return this.resumeAward(saved, base);
    }
  }

  async saveAward(input) {
    await this.authorizeWrite();
    return this.studentRewardRepository.save(input);
  }

  async resumeAward(existing, base) {
    const award = {...base, coins: existing.coins};
    requireMatchingAward(existing, award);
    return this.saveAward(award);
  }
}

module.exports = {AwardAdditionalMissionCompletion};
