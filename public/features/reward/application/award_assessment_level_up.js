import {RewardCategory} from "../../../config/firebase/reward_schema.js?v=20261010-student-rewards-v1";
import {ASSESSMENT_FRAMEWORK_END_LEVEL_ID} from "../../../config/firebase/assessment_framework_schema.js";
import {requireStudentRewardPracticeScope} from "../domain/student_reward.js?v=20261010-daily-mission-rewards-v1";
import {requireCoinValue} from "../domain/reward_config.js?v=20261010-reward-v1";
import {createAssessmentLevelRewardId, requireMatchingLevelAward} from "../domain/assessment_level_reward.js?v=20261010-level-rewards-v1";

class AwardAssessmentLevelUp {
  constructor({studentRewardRepository, getStudentPracticeAssessment, listCompletedPracticeIds,
    getAssessmentFrameworkRewardConfig, authorizeWrite = () => {}} = {}) {
    if (typeof studentRewardRepository?.saveAssessmentLevelAwards !== "function"
        || typeof studentRewardRepository?.getById !== "function"
        || [getStudentPracticeAssessment, listCompletedPracticeIds, getAssessmentFrameworkRewardConfig, authorizeWrite]
          .some(value => typeof value !== "function")) throw new Error("Level reward dependencies are required.");
    Object.assign(this, {studentRewardRepository, getStudentPracticeAssessment, listCompletedPracticeIds,
      getAssessmentFrameworkRewardConfig, authorizeWrite});
  }

  async execute(input) {
    const scope = requireStudentRewardPracticeScope(input);
    await this.authorizeWrite();
    const assessment = await this.getStudentPracticeAssessment(scope);
    if (assessment === null || assessment.reachedLevelIds.length === 0) return null;
    if (assessment.studentId !== scope.studentId || assessment.practiceId !== scope.practiceId) throw new Error("Assessment does not match the completed practice.");
    if (!(await this.listCompletedPracticeIds({studentId: scope.studentId})).includes(scope.practiceId)) {
      const error = new Error("The assessed practice has not been completed.");
      error.code = "failed-precondition";
      throw error;
    }

    const candidates = await Promise.all(assessment.reachedLevelIds.map(async levelId => {
      const details = {syllabusId: assessment.syllabusId, topicId: assessment.topicId,
        assessmentFrameworkId: assessment.assessmentFrameworkId, levelId};
      const base = {studentId: scope.studentId, categoryId: RewardCategory.ASSESSMENT_LEVEL,
        awardId: await createAssessmentLevelRewardId(details), sourceId: scope.practiceId,
        details: {...details, previousLevelId: assessment.previousLevelId, reachedLevelId: assessment.levelId}};
      const existing = await this.studentRewardRepository.getById(base);
      if (existing !== null) requireMatchingLevelAward(existing, base);
      return {base, existing};
    }));
    const missing = candidates.some(candidate => candidate.existing === null);
    const config = missing ? await this.getAssessmentFrameworkRewardConfig({assessmentFrameworkId: assessment.assessmentFrameworkId}) : null;
    const awards = candidates.map(({base, existing}) => {
      if (existing !== null) return {...base, coins: existing.coins, sourceId: existing.sourceId, details: existing.details};
      let coins = config?.levelCoins?.[base.details.levelId];
      // Framework completion has an optional allocation; retain a zero award
      // when it is absent so a later config change cannot reward the same level again.
      if (coins === undefined && base.details.levelId === ASSESSMENT_FRAMEWORK_END_LEVEL_ID) coins = 0;
      if (coins === undefined) {
        const error = new Error("Configure coins for assessment level '" + base.details.levelId + "' before awarding it.");
        error.code = "failed-precondition";
        throw error;
      }
      return {...base, coins: requireCoinValue(coins, "levelCoins." + base.details.levelId)};
    });
    await this.authorizeWrite();
    return this.studentRewardRepository.saveAssessmentLevelAwards(awards);
  }
}

export {AwardAssessmentLevelUp};
