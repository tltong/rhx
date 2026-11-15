const {createHash} = require("node:crypto");
const {getFirestoreDb} = require("../../utils/firebase/firebase_ops");
const {guardResetTransaction} = require("../../utils/student_topic_reset_guard");
const {DEFAULT_REWARD_CONFIG, RewardCategory} = require("../../schema/reward_schema");
const {requireCoinValue} = require("./domain/reward_config");
const {requireStoredTotal, requireStudentRewardScope} = require("./domain/student_reward");

function newsRewardSettings(config = {}) {
  return {completionCoins: requireCoinValue(config.newsArticleCompletionCoins === undefined ? DEFAULT_REWARD_CONFIG.newsArticleCompletionCoins : config.newsArticleCompletionCoins, "newsArticleCompletionCoins"),
    allCorrectCoins: requireCoinValue(config.newsAllCorrectCoins === undefined ? DEFAULT_REWARD_CONFIG.newsAllCorrectCoins : config.newsAllCorrectCoins, "newsAllCorrectCoins")};
}
function validateSettings(settings) {
  return {completionCoins: requireCoinValue(settings.completionCoins, "completionCoins"), allCorrectCoins: requireCoinValue(settings.allCorrectCoins, "allCorrectCoins")};
}
function createNewsRewards({getDb = getFirestoreDb, now = () => new Date()} = {}) {
  async function settings() {return newsRewardSettings((await getDb().doc("rewards/config").get()).data() || {});}
  // Participate in the news submission transaction: all ledger reads precede
  // writes, so answers, completion, both awards and totals commit together.
  async function stageCompletion(tx, {studentId, storyId, assignmentId, score, rewardSettings}) {
    requireStudentRewardScope({studentId});
    if (typeof storyId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(storyId) || !Number.isInteger(score) || score < 0 || score > 3) throw Error("Invalid news reward source.");
    const amounts = validateSettings(rewardSettings), db = getDb(), root = db.doc("rewards/" + studentId);
    const awardId = "news_" + createHash("sha256").update(storyId).digest("hex");
    const refs = [RewardCategory.NEWS_COMPLETION, RewardCategory.NEWS_ALL_CORRECT].map(category => {
      const categoryRef = root.collection("categories").doc(category); return {categoryRef, historyRef: categoryRef.collection("history").doc(awardId)};
    });
    await guardResetTransaction(tx, db);
    const [student, ...records] = await Promise.all([tx.get(root), ...refs.flatMap(ref => [tx.get(ref.categoryRef), tx.get(ref.historyRef)])]);
    const total = requireStoredTotal(student.exists ? student.data() : null), categoryTotals = [records[0], records[2]].map(record => requireStoredTotal(record.exists ? record.data() : null));
    if (categoryTotals.some(value => value > total)) throw Error("Stored reward totals are inconsistent.");
    const existing = records[1].data(), existingBonus = records[3].data();
    if (existing && (!student.exists || !records[0].exists || existing.sourceId !== storyId || existing.details?.storyId !== storyId)) throw Error("Stored news reward is inconsistent.");
    const completionCoins = existing ? requireCoinValue(existing.coins, "completionCoins") : amounts.completionCoins;
    const firstScore = existing ? existing.details.score : score;
    if (!Number.isInteger(firstScore) || firstScore < 0 || firstScore > 3) throw Error("Stored news reward score is invalid.");
    const allCorrectCoins = firstScore === 3 ? requireCoinValue(existing ? existing.details.allCorrectCoins : amounts.allCorrectCoins, "allCorrectCoins") : 0;
    if (existingBonus && (!existing || !student.exists || !records[2].exists || existingBonus.sourceId !== storyId || existingBonus.coins !== allCorrectCoins || firstScore !== 3)) throw Error("Stored news bonus is inconsistent.");
    const planned = [{coins: completionCoins, fresh: !existing}, {coins: allCorrectCoins, fresh: firstScore === 3 && !existingBonus}];
    const added = planned.reduce((sum, award) => requireCoinValue(sum + (award.fresh ? award.coins : 0), "coinsAwarded"), 0);
    const updatedTotal = requireCoinValue(total + added, "totalCoins"), earnedAt = now();
    if (planned.some(award => award.fresh)) tx.set(root, {totalCoins: updatedTotal, updatedAt: earnedAt}, {merge: true});
    planned.forEach((award, index) => {
      if (!award.fresh) return;
      tx.set(refs[index].categoryRef, {totalCoins: requireCoinValue(categoryTotals[index] + award.coins, "categoryTotalCoins"), updatedAt: earnedAt}, {merge: true});
      tx.create(refs[index].historyRef, {coins: award.coins, earnedAt, sourceId: storyId,
        details: existing?.details || {storyId, assignmentId, score, allCorrectCoins: amounts.allCorrectCoins}});
    });
    return {completionCoins, allCorrectCoins, totalCoins: requireCoinValue(completionCoins + allCorrectCoins, "articleCoins")};
  }
  return {settings, stageCompletion};
}
module.exports = {createNewsRewards, newsRewardSettings};
