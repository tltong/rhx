import {DEFAULT_REWARD_CONFIG, RewardCategory, LOGIN_STREAK_DAYS} from "../../../config/firebase/reward_schema.js?v=20261010-student-rewards-v1";
import {STUDENT_LOGIN_HISTORY_DAYS} from "../../../config/firebase/student_login_schema.js?v=20261010-login-rewards-v1";
import {
  StudentLoginRecord, requireLoginCounter, requireLoginDate, getLoginDayContext, shiftLoginDate,
} from "../../student_login/domain/student_login.js?v=20261010-login-rewards-v1";
import {requireStudentRewardScope} from "../domain/student_reward.js?v=20261010-daily-mission-rewards-v1";
import {requireCoinValue} from "../domain/reward_config.js?v=20261010-reward-v1";

const maximumMilestone = Math.max(...LOGIN_STREAK_DAYS.map(Number));

function streakMilestone(days) {
  return LOGIN_STREAK_DAYS.includes(String(days)) ? days : null;
}

// Compatibility for timestamp-only records from older clients. New records carry
// the streak snapshot, so delayed events do not depend on retained history.
async function readLegacyStreak(login, listHistory, now) {
  const {earliest, today} = getLoginDayContext(now());
  if (login.loginDate < earliest || login.loginDate > today) {
    throw new Error("The login is outside the retained history window and has no streak snapshot.");
  }
  const {entries} = await listHistory({studentId: login.studentId, limit: STUDENT_LOGIN_HISTORY_DAYS});
  const dates = new Set(entries.filter((entry) => entry.studentId === login.studentId).map((entry) => entry.loginDate));
  if (!dates.has(login.loginDate)) throw new Error("The daily login record could not be found.");
  let days = 1;
  let previous = shiftLoginDate(login.loginDate, -1);
  while (days <= maximumMilestone) {
    if (previous < earliest) {
      throw new Error("The login streak cannot be determined from the retained history.");
    }
    if (!dates.has(previous)) break;
    days += 1;
    previous = shiftLoginDate(previous, -1);
  }
  return days;
}

function requireDailyPlan(award, scope, login) {
  if (award.studentId !== scope.studentId || award.categoryId !== scope.categoryId
      || award.awardId !== scope.awardId || award.sourceId !== login.loginDate
      || award.details?.loginDate !== login.loginDate) {
    throw new Error("The daily login reward contains conflicting source data.");
  }
  const days = requireLoginCounter(award.details.currentStreakDays, "reward currentStreakDays");
  const milestone = streakMilestone(days);
  if ((login.currentStreakDays !== undefined && days !== login.currentStreakDays)
      || award.details.streakMilestoneDays !== milestone) {
    throw new Error("The daily login reward contains conflicting streak data.");
  }
  requireCoinValue(award.coins, "dailyLoginCoins");
  requireCoinValue(award.details.streakCoins, "streakCoins");
  if (milestone === null && award.details.streakCoins !== 0) {
    throw new Error("A login without a streak milestone must not award streak coins.");
  }
  return award;
}

class AwardStudentLogin {
  constructor({
    studentRewardRepository, getStudentLoginRecord, listStudentLoginHistory,
    getRewardConfig, authorizeWrite = () => {}, now = () => new Date(),
  } = {}) {
    if (typeof studentRewardRepository?.getById !== "function"
        || typeof studentRewardRepository?.save !== "function"
        || [getStudentLoginRecord, listStudentLoginHistory, getRewardConfig, authorizeWrite, now]
          .some(dependency => typeof dependency !== "function")) {
      throw new Error("Student login reward dependencies are required.");
    }
    Object.assign(this, {
      studentRewardRepository, getStudentLoginRecord, listStudentLoginHistory,
      getRewardConfig, authorizeWrite, now,
    });
  }

  async execute(input) {
    const loginScope = {
      ...requireStudentRewardScope(input),
      loginDate: requireLoginDate(input.loginDate),
    };
    await this.authorizeWrite();
    const scope = {
      studentId: loginScope.studentId, categoryId: RewardCategory.DAILY_LOGIN,
      awardId: "daily-login-" + loginScope.loginDate,
    };
    let award = await this.studentRewardRepository.getById(scope);
    const savedLogin = await this.getStudentLoginRecord(loginScope);
    if (savedLogin === null && award === null) {
      const error = new Error("The student login record was not found.");
      error.code = "not-found";
      throw error;
    }
    // A committed daily award proves the login and fixes its bonus plan. It can
    // finish on retry even after the 45-day login history has been pruned.
    const login = savedLogin === null ? loginScope : new StudentLoginRecord(savedLogin);
    if (login.studentId !== loginScope.studentId || login.loginDate !== loginScope.loginDate) {
      throw new Error("The saved login does not match the requested student and date.");
    }

    if (award !== null) {
      requireDailyPlan(award, scope, login);
    } else {
      const days = login.currentStreakDays
        ?? await readLegacyStreak(login, this.listStudentLoginHistory, this.now);
      const milestone = streakMilestone(days);
      const config = await this.getRewardConfig() ?? DEFAULT_REWARD_CONFIG;
      award = {
        ...scope, sourceId: login.loginDate,
        coins: requireCoinValue(config.dailyLoginCoins, "dailyLoginCoins"),
        // Persist the bonus decision. Config changes and partial failures must
        // never alter a previously committed reward plan.
        details: {
          loginDate: login.loginDate, currentStreakDays: days, streakMilestoneDays: milestone,
          streakCoins: milestone === null ? 0
            : requireCoinValue(config.loginStreakCoins?.[String(milestone)], "streakCoins"),
        },
      };
    }

    let dailyReward;
    try {
      dailyReward = await this.saveAward({...award});
    } catch (error) {
      if (error.code !== "already-exists") throw error;
      // Concurrent calls may observe different configs. The first commit wins.
      const existing = await this.studentRewardRepository.getById(scope);
      if (existing === null) throw error;
      award = requireDailyPlan(existing, scope, login);
      dailyReward = await this.saveAward({...award});
    }

    const milestone = award.details.streakMilestoneDays;
    const streakReward = milestone === null ? null : await this.saveAward({
      studentId: loginScope.studentId, categoryId: RewardCategory.LOGIN_STREAK,
      awardId: "login-streak-" + milestone + "-" + login.loginDate,
      sourceId: login.loginDate, coins: award.details.streakCoins,
      details: {loginDate: login.loginDate, streakDays: milestone},
    });
    return {dailyReward, streakReward};
  }

  async saveAward(input) {
    // Recheck browser authorization after reads, including before a bonus write.
    await this.authorizeWrite();
    return this.studentRewardRepository.save(input);
  }
}

export {AwardStudentLogin};
