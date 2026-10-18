import {DEFAULT_REWARD_CONFIG, RewardCategory} from "../../../config/firebase/reward_schema.js?v=20261010-student-rewards-v1";
import {requireStudentRewardPracticeScope, requireMatchingAward} from "../domain/student_reward.js?v=20261010-daily-mission-rewards-v1";
import {requireCoinValue} from "../domain/reward_config.js?v=20261010-reward-v1";
import {createAdditionalMissionRewardId} from "../domain/additional_mission_reward_id.js?v=20261010-additional-mission-rewards-v1";

class AwardAdditionalMissionCompletion {
  constructor({studentRewardRepository, getAcceptedAdditionalMissionForPractice,
    listCompletedPracticeIds, getCompletedEssayPractice = async () => null, getRewardConfig, authorizeWrite = () => {}} = {}) {
    if (typeof studentRewardRepository?.getById !== "function" || typeof studentRewardRepository?.save !== "function"
        || typeof getAcceptedAdditionalMissionForPractice !== "function" || typeof listCompletedPracticeIds !== "function"
        || typeof getRewardConfig !== "function" || typeof authorizeWrite !== "function") {
      throw new Error("Additional mission reward dependencies are required.");
    }
    Object.assign(this, {studentRewardRepository, getAcceptedAdditionalMissionForPractice, listCompletedPracticeIds, getCompletedEssayPractice, getRewardConfig, authorizeWrite});
  }

  async execute(input) {
    const type = input?.practiceType ?? "normal";
    if (!["normal", "essay"].includes(type)) throw new Error("Unknown mission practice type.");
    const scope = {...requireStudentRewardPracticeScope(input), ...(type === "essay" ? {practiceType: type} : {})};
    await this.authorizeWrite();
    const mission = await this.getAcceptedAdditionalMissionForPractice(scope);
    if (mission === null) return null;
    if (mission?.practiceId !== scope.practiceId) throw new Error("The accepted mission does not match the requested practice.");
    if ((mission.practiceType ?? "normal") !== type) throw new Error("The accepted mission type does not match.");
    const essay = type === "essay" ? await this.getCompletedEssayPractice({studentId: scope.studentId, essayPracticeId: scope.practiceId}) : null;
    const completed = type === "essay" ? Boolean(essay && essay.syllabusId === mission.syllabusId && essay.topicId === mission.topicId)
      : (await this.listCompletedPracticeIds({studentId: scope.studentId})).includes(scope.practiceId);
    if (!completed) {
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
        ...(type === "essay" ? {practiceType: type} : {}),
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

export {AwardAdditionalMissionCompletion};
