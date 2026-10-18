const {FieldValue, FieldPath} = require("firebase-admin/firestore");
const firebaseOps = require("../../../utils/firebase/firebase_ops");
const {guardResetTransaction} = require("../../../utils/student_topic_reset_guard");

const {RewardCategory, REWARDS_COLLECTION, REWARD_CATEGORIES_SUBCOLLECTION, REWARD_HISTORY_SUBCOLLECTION} = require("../../../schema/reward_schema");
const {requireCoinValue} = require("../domain/reward_config");
const {StudentRewardHistoryEntry, requireStudentRewardScope, requireStudentRewardCategoryScope, requireStudentRewardAwardScope, requireStudentRewardInput, requireStoredTotal, requireMatchingAward, requireStudentRewardHistoryInput, requireRecentStudentRewardActivitiesInput} = require("../domain/student_reward");
const {StudentRewardRepository} = require("../domain/student_reward_repository");


const {requireMatchingLevelAward} = require("../domain/assessment_level_reward");

function categoryCollectionPath({studentId}) {
  return [REWARDS_COLLECTION, studentId, REWARD_CATEGORIES_SUBCOLLECTION].join("/");
}
function historyCollectionPath(scope) {
  return [categoryCollectionPath(scope), scope.categoryId, REWARD_HISTORY_SUBCOLLECTION].join("/");
}
function timestampParts(value, date) {
  if (Number.isSafeInteger(value?.seconds) && Number.isInteger(value?.nanoseconds)) {
    return {seconds: value.seconds, nanoseconds: value.nanoseconds};
  }
  const milliseconds = date.getTime();
  const seconds = Math.floor(milliseconds / 1000);
  return {seconds, nanoseconds: (milliseconds - seconds * 1000) * 1000000};
}
class FirestoreStudentRewardRepository extends StudentRewardRepository {
  constructor({
    readDocument = firebaseOps.readDocument,
    getDocumentRef = firebaseOps.getDocumentRef,
    getCollectionRef = firebaseOps.getCollectionRef,
    getFirestoreDb = firebaseOps.getFirestoreDb,
    serverTimestamp = () => FieldValue.serverTimestamp(),
    documentIdField = () => FieldPath.documentId(),
  } = {}) {
    super();
    Object.assign(this, {readDocument, getDocumentRef, getCollectionRef, getFirestoreDb, serverTimestamp, documentIdField});
  }

  async save(input) {
    const award = requireStudentRewardInput(input);
    const studentDocument = this.getDocumentRef(REWARDS_COLLECTION, award.studentId);
    const categoryDocument = this.getDocumentRef(categoryCollectionPath(award), award.categoryId);
    const historyDocument = this.getDocumentRef(historyCollectionPath(award), award.awardId);
    const totals = await this.getFirestoreDb().runTransaction(async (transaction) => {
      await guardResetTransaction(transaction, this.getFirestoreDb());
      // Read before writing so retries and concurrent awards share the same totals.
      const [history, student, category] = await Promise.all([
        transaction.get(historyDocument), transaction.get(studentDocument), transaction.get(categoryDocument),
      ]);
      const totalCoins = requireStoredTotal(student.exists ? student.data() : null);
      const categoryTotalCoins = requireStoredTotal(category.exists ? category.data() : null);
      if (categoryTotalCoins > totalCoins) throw new Error("Stored reward totals are inconsistent.");
      if (history.exists) {
        if (!student.exists || !category.exists) throw new Error("Saved reward totals are missing.");
        const existing = new StudentRewardHistoryEntry({
          ...history.data(), studentId: award.studentId, categoryId: award.categoryId, awardId: award.awardId,
        });
        requireMatchingAward(existing, award);
        return {totalCoins, categoryTotalCoins, alreadyAwarded: true};
      }
      const updatedTotal = requireCoinValue(totalCoins + award.coins, "totalCoins");
      const updatedCategoryTotal = requireCoinValue(categoryTotalCoins + award.coins, "categoryTotalCoins");
      const timestamp = this.serverTimestamp();
      transaction.set(studentDocument, {totalCoins: updatedTotal, updatedAt: timestamp}, {merge: true});
      transaction.set(categoryDocument, {totalCoins: updatedCategoryTotal, updatedAt: timestamp}, {merge: true});
      transaction.set(historyDocument, {
        coins: award.coins, earnedAt: timestamp, sourceId: award.sourceId, details: award.details,
      });
      return {totalCoins: updatedTotal, categoryTotalCoins: updatedCategoryTotal, alreadyAwarded: false};
    });
    const saved = await historyDocument.get();
    if (!saved.exists) throw new Error("Saved reward history entry could not be read.");
    return {
      award: new StudentRewardHistoryEntry({...saved.data(), studentId: award.studentId, categoryId: award.categoryId, awardId: award.awardId}),
      ...totals,
    };
  }

  async saveAssessmentLevelAwards(input) {
    if (!Array.isArray(input) || input.length === 0 || input.length > 498) throw new Error("Level awards must contain from 1 to 498 entries.");
    const awards = input.map(requireStudentRewardInput);
    const scope = awards[0];
    if (awards.some(award => award.studentId !== scope.studentId || award.categoryId !== RewardCategory.ASSESSMENT_LEVEL)
        || new Set(awards.map(award => award.awardId)).size !== awards.length) throw new Error("Level awards must have one student, category and unique level IDs.");
    const studentDocument = this.getDocumentRef(REWARDS_COLLECTION, scope.studentId);
    const categoryDocument = this.getDocumentRef(categoryCollectionPath(scope), scope.categoryId);
    const histories = awards.map(award => this.getDocumentRef(historyCollectionPath(award), award.awardId));
    const totals = await this.getFirestoreDb().runTransaction(async transaction => {
      await guardResetTransaction(transaction, this.getFirestoreDb());
      const [student, category, ...saved] = await Promise.all([
        transaction.get(studentDocument), transaction.get(categoryDocument),
        ...histories.map(ref => transaction.get(ref)),
      ]);
      const totalCoins = requireStoredTotal(student.exists ? student.data() : null);
      const categoryTotalCoins = requireStoredTotal(category.exists ? category.data() : null);
      if (categoryTotalCoins > totalCoins) throw new Error("Stored reward totals are inconsistent.");
      const fresh = [];
      let coinsAwarded = 0;
      for (const [index, award] of awards.entries()) {
        if (saved[index].exists) {
          if (!student.exists || !category.exists) throw new Error("Saved reward totals are missing.");
          const existing = new StudentRewardHistoryEntry({...saved[index].data(), studentId: award.studentId, categoryId: award.categoryId, awardId: award.awardId});
          requireMatchingLevelAward(existing, award);
        } else {
          coinsAwarded = requireCoinValue(coinsAwarded + award.coins, "coinsAwarded");
          fresh.push(index);
        }
      }
      const updatedTotal = requireCoinValue(totalCoins + coinsAwarded, "totalCoins");
      const updatedCategory = requireCoinValue(categoryTotalCoins + coinsAwarded, "categoryTotalCoins");
      if (fresh.length) {
        const timestamp = this.serverTimestamp();
        transaction.set(studentDocument, {totalCoins: updatedTotal, updatedAt: timestamp}, {merge: true});
        transaction.set(categoryDocument, {totalCoins: updatedCategory, updatedAt: timestamp}, {merge: true});
        for (const index of fresh) {
          const award = awards[index];
          transaction.set(histories[index], {coins: award.coins, earnedAt: timestamp, sourceId: award.sourceId, details: award.details});
        }
      }
      return {coinsAwarded, totalCoins: updatedTotal, categoryTotalCoins: updatedCategory, alreadyAwarded: fresh.length === 0};
    });
    const saved = await Promise.all(histories.map(ref => ref.get()));
    return {awards: saved.map((record, index) => {
      if (!record.exists) throw new Error("Saved level reward could not be read.");
      return new StudentRewardHistoryEntry({...record.data(), studentId: awards[index].studentId, categoryId: awards[index].categoryId, awardId: awards[index].awardId});
    }), ...totals};
  }

  async getById(input) {
    const scope = requireStudentRewardAwardScope(input);
    const data = await this.readDocument(historyCollectionPath(scope), scope.awardId);
    return data === null ? null : new StudentRewardHistoryEntry({...data, ...scope});
  }

  async getTotal(input) {
    const scope = requireStudentRewardScope(input);
    return requireStoredTotal(await this.readDocument(REWARDS_COLLECTION, scope.studentId));
  }

  async getCategoryTotal(input) {
    const scope = requireStudentRewardCategoryScope(input);
    return requireStoredTotal(await this.readDocument(categoryCollectionPath(scope), scope.categoryId));
  }

  async listHistory(input) {
    const scope = requireStudentRewardHistoryInput(input);
    let query = this.getCollectionRef(historyCollectionPath(scope))
      .orderBy("earnedAt", "desc").orderBy(this.documentIdField(), "desc");
    if (scope.cursor) {
      const cursorDocument = await this.getDocumentRef(historyCollectionPath(scope), scope.cursor.awardId).get();
      if (!cursorDocument.exists) {
        const error = new Error("Reward history cursor was not found.");
        error.code = "not-found";
        throw error;
      }
      // Use the snapshot to retain Firestore timestamp precision across pages.
      query = query.startAfter(cursorDocument);
    }
    const snapshot = await query.limit(scope.limit + 1).get();
    const entries = snapshot.docs.slice(0, scope.limit).map((record) => new StudentRewardHistoryEntry({
      ...record.data(), studentId: scope.studentId, categoryId: scope.categoryId, awardId: record.id,
    }));
    const last = entries.at(-1);
    const nextCursor = snapshot.docs.length > scope.limit
      ? {studentId: scope.studentId, categoryId: scope.categoryId, awardId: last.awardId} : null;
    return {entries, nextCursor};
  }

  async listRecentActivities(input) {
    const scope = requireRecentStudentRewardActivitiesInput(input);
    const categoryEntries = await Promise.all(Object.values(RewardCategory).map(async (categoryId) => {
      const entries = [];
      let query = this.getCollectionRef(historyCollectionPath({...scope, categoryId}))
        .orderBy("earnedAt", "desc").orderBy(this.documentIdField(), "desc");
      while (entries.length < scope.limit) {
        const snapshot = await query.limit(scope.limit + 1).get();
        const records = snapshot.docs.slice(0, scope.limit);
        for (const record of records) {
          const data = record.data();
          const entry = new StudentRewardHistoryEntry({
            ...data, studentId: scope.studentId, categoryId, awardId: record.id,
          });
          if (entry.coins > 0) entries.push({entry, ...timestampParts(data.earnedAt, entry.earnedAt)});
        }
        if (snapshot.docs.length <= scope.limit) break;
        query = query.startAfter(records.at(-1));
      }
      return entries.slice(0, scope.limit);
    }));
    return Object.freeze(categoryEntries.flat().sort((left, right) => (
      right.seconds - left.seconds || right.nanoseconds - left.nanoseconds
      || right.entry.categoryId.localeCompare(left.entry.categoryId)
      || right.entry.awardId.localeCompare(left.entry.awardId)
    )).slice(0, scope.limit).map(({entry}) => entry));
  }
}

module.exports = {FirestoreStudentRewardRepository};
