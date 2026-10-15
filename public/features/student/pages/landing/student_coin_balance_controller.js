const ACTIVITY_LABELS = Object.freeze({
  dailyLogin: "Daily login",
  dailyMissionCompletion: "Daily mission completed",
  bonusMissionCompletion: "Additional mission completed",
  assessmentLevel: "Assessment level reached",
  loginStreak: "Login streak reward",
});

function activityLabel(entry) {
  if (entry.categoryId === "loginStreak" && Number.isSafeInteger(entry.details?.streakDays)) {
    return entry.details.streakDays + "-day login streak";
  }
  return ACTIVITY_LABELS[entry.categoryId] || "Coin reward";
}

export class StudentCoinBalanceController {
  constructor({watchStudentRewardTotal, getRewardConfig, listRecentStudentRewardActivities,
    defaultRecentActivitiesLimit, section, balance, status, activityList, activityStatus,
    formatter = new Intl.NumberFormat(undefined, {maximumFractionDigits: 0}),
    createElement = tagName => document.createElement(tagName),
    logError = error => console.error("Could not load student coins.", error)} = {}) {
    if (typeof watchStudentRewardTotal !== "function" || typeof getRewardConfig !== "function"
        || typeof listRecentStudentRewardActivities !== "function"
        || !Number.isSafeInteger(defaultRecentActivitiesLimit) || defaultRecentActivitiesLimit < 1
        || !section || !balance || !status || !activityList || !activityStatus
        || typeof createElement !== "function") {
      throw new Error("The coin elements and Reward feature APIs are required.");
    }
    Object.assign(this, {watchStudentRewardTotal, getRewardConfig, listRecentStudentRewardActivities,
      defaultRecentActivitiesLimit, section, balance, status, activityList, activityStatus,
      formatter, createElement, logError});
    this.unsubscribe = null;
    this.generation = 0;
    this.activityRequest = 0;
    this.hasActivitiesLoaded = false;
  }

  start({studentId}) {
    this.stop();
    const generation = this.generation;
    let hasBalance = false;
    this.section.hidden = false;
    const onError = error => {
      if (generation !== this.generation) return;
      this.logError(error);
      this.setStatus(hasBalance
        ? "Coin balance may be out of date. Refresh to try again."
        : "Could not load your coins. Refresh to try again.", true);
    };
    try {
      this.unsubscribe = this.watchStudentRewardTotal({
        studentId,
        onChange: totalCoins => {
          if (generation !== this.generation) return;
          this.balance.textContent = this.formatter.format(totalCoins);
          hasBalance = true;
          this.setStatus("", false, true);
          void this.refreshActivities({studentId, generation});
        },
        onError,
      });
    } catch (error) {
      onError(error);
    }
  }

  async refreshActivities({studentId, generation}) {
    const request = ++this.activityRequest;
    if (!this.hasActivitiesLoaded) this.setActivityStatus("Loading recent activity...");
    try {
      const config = await this.getRewardConfig();
      const limit = config?.recentActivitiesLimit ?? this.defaultRecentActivitiesLimit;
      const entries = await this.listRecentStudentRewardActivities({studentId, limit});
      if (generation !== this.generation || request !== this.activityRequest) return;
      this.renderActivities(entries);
      this.hasActivitiesLoaded = true;
      this.setActivityStatus(entries.length ? "" : "No coin rewards yet.", false, entries.length > 0);
    } catch (error) {
      if (generation !== this.generation || request !== this.activityRequest) return;
      this.logError(error);
      this.setActivityStatus(this.hasActivitiesLoaded
        ? "Recent activity may be out of date."
        : "Could not load recent activity. Refresh to try again.", true);
    }
  }

  renderActivities(entries) {
    const items = entries.map(entry => {
      const item = this.createElement("li");
      const label = this.createElement("span");
      const amount = this.createElement("span");
      item.className = "coin-activity-item";
      label.className = "coin-activity-label";
      amount.className = "coin-activity-amount";
      label.textContent = activityLabel(entry);
      amount.textContent = "+" + this.formatter.format(entry.coins)
        + (entry.coins === 1 ? " coin" : " coins");
      item.append(label, amount);
      return item;
    });
    this.activityList.replaceChildren(...items);
  }

  stop() {
    this.generation++;
    this.activityRequest++;
    const unsubscribe = this.unsubscribe;
    this.unsubscribe = null;
    if (typeof unsubscribe === "function") unsubscribe();
    this.section.hidden = true;
    this.balance.textContent = "—";
    this.activityList.replaceChildren();
    this.hasActivitiesLoaded = false;
    this.setStatus("Loading your coins...");
    this.setActivityStatus("Loading recent activity...");
  }

  setStatus(message, isError = false, hidden = false) {
    this.status.textContent = message;
    this.status.classList.toggle("is-error", isError);
    this.status.hidden = hidden;
  }

  setActivityStatus(message, isError = false, hidden = false) {
    this.activityStatus.textContent = message;
    this.activityStatus.classList.toggle("is-error", isError);
    this.activityStatus.hidden = hidden;
  }
}

export {activityLabel};
