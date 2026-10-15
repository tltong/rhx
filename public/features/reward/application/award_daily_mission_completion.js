import {DEFAULT_REWARD_CONFIG, RewardCategory} from "../../../config/firebase/reward_schema.js?v=20261010-student-rewards-v1";
import {requireStudentRewardPracticeScope, requireMatchingAward} from "../domain/student_reward.js?v=20261010-daily-mission-rewards-v1";
import {requireCoinValue} from "../domain/reward_config.js?v=20261010-reward-v1";
import {createDailyMissionRewardId} from "../domain/daily_mission_reward_id.js?v=20261010-daily-mission-rewards-v1";

class AwardDailyMissionCompletion {
  constructor({studentRewardRepository, getAcceptedDailyMissionForPractice,
    listCompletedPracticeIds, getRewardConfig, authorizeWrite = () => {}} = {}) {
    if (typeof studentRewardRepository?.getById !== "function" || typeof studentRewardRepository?.save !== "function"
        || typeof getAcceptedDailyMissionForPractice !== "function" || typeof listCompletedPracticeIds !== "function"
        || typeof getRewardConfig !== "function" || typeof authorizeWrite !== "function") {
      throw new Error("Daily mission reward dependencies are required.");
    }
    Object.assign(this, {studentRewardRepository, getAcceptedDailyMissionForPractice, listCompletedPracticeIds, getRewardConfig, authorizeWrite});
  }

  async execute(input) {
    const scope = requireStudentRewardPracticeScope(input);
    await this.authorizeWrite();
    const mission = await this.getAcceptedDailyMissionForPractice(scope);
    if (mission === null) return null;
    if (mission?.practiceId !== scope.practiceId) throw new Error("The accepted mission does not match the requested practice.");
    const completedIds = await this.listCompletedPracticeIds({studentId: scope.studentId});
    if (!completedIds.includes(scope.practiceId)) {
      const error = new Error("The accepted daily mission practice has not been completed.");
      error.code = "failed-precondition";
      throw error;
    }

    const awardScope = {
      studentId: scope.studentId, categoryId: RewardCategory.DAILY_MISSION_COMPLETION,
      awardId: await createDailyMissionRewardId(mission),
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
      return await this.studentRewardRepository.save({
        ...base, coins: requireCoinValue(config.dailyMissionCompletionCoins, "dailyMissionCompletionCoins"),
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

  async resumeAward(existing, base) {
    const award = {...base, coins: existing.coins};
    requireMatchingAward(existing, award);
    return this.studentRewardRepository.save(award);
  }
}

export {AwardDailyMissionCompletion};
