const {FieldValue, FieldPath} = require("firebase-admin/firestore");
const firebaseOps = require("../../../utils/firebase/firebase_ops");
const {STUDENT_LOGINS_COLLECTION, STUDENT_LOGIN_HISTORY_SUBCOLLECTION, STUDENT_LOGIN_PRUNE_BATCH_SIZE} = require("../../../schema/student_login_schema");
const {StudentLoginSummary, StudentLoginRecord, requireStudentLoginScope, requireLoginDate, loginDayDifference, getLoginDayContext, requireRetainedLoginDate, requireStudentLoginDateScope, requireStudentLoginHistoryInput, requireLoginCounter, requireStoredLoginSummary, evaluateLoginSummary} = require("../domain/student_login");
const {StudentLoginRepository} = require("../domain/student_login_repository");

function historyCollectionPath({studentId}) {
  return [STUDENT_LOGINS_COLLECTION, studentId, STUDENT_LOGIN_HISTORY_SUBCOLLECTION].join("/");
}

class FirestoreStudentLoginRepository extends StudentLoginRepository {
  constructor({
    readDocument = firebaseOps.readDocument,
    getDocumentRef = firebaseOps.getDocumentRef,
    getCollectionRef = firebaseOps.getCollectionRef,
    getFirestoreDb = firebaseOps.getFirestoreDb,
    serverTimestamp = () => FieldValue.serverTimestamp(),
    documentIdField = () => FieldPath.documentId(),
    now = () => new Date(),
  } = {}) {
    super();
    Object.assign(this, {readDocument, getDocumentRef, getCollectionRef, getFirestoreDb, serverTimestamp, documentIdField, now});
  }

  async record(input) {
    const scope = requireStudentLoginScope(input);
    const summaryDocument = this.getDocumentRef(STUDENT_LOGINS_COLLECTION, scope.studentId);
    const result = await this.getFirestoreDb().runTransaction(async (transaction) => {
      // Re-evaluate the UTC day on transaction retries, including midnight races.
      const day = getLoginDayContext(this.now());
      const historyDocument = this.getDocumentRef(historyCollectionPath(scope), day.today);
      const [summarySnapshot, historySnapshot] = await Promise.all([
        transaction.get(summaryDocument), transaction.get(historyDocument),
      ]);
      const summary = requireStoredLoginSummary(summarySnapshot.exists ? summarySnapshot.data() : null, scope);
      if (summary && summary.lastLoginDate > day.today) {
        throw new Error("The latest recorded login is ahead of the current UTC day.");
      }
      if (historySnapshot.exists) {
        if (!summary || summary.lastLoginDate !== day.today) {
          throw new Error("The daily login record and summary are inconsistent.");
        }
        return {
          loginRecord: new StudentLoginRecord({...historySnapshot.data(), ...scope, loginDate: day.today}),
          summary, isFirstLoginOfDay: false,
        };
      }
      if (summary?.lastLoginDate === day.today) {
        throw new Error("Today's login history record is missing.");
      }
      const totalLoginDays = requireLoginCounter((summary?.totalLoginDays || 0) + 1, "totalLoginDays");
      const currentStreakDays = summary && loginDayDifference(summary.lastLoginDate, day.today) === 1
        ? requireLoginCounter(summary.currentStreakDays + 1, "currentStreakDays") : 1;
      const longestStreakDays = Math.max(summary?.longestStreakDays || 0, currentStreakDays);
      const timestamp = this.serverTimestamp();
      transaction.set(summaryDocument, {
        lastLoginAt: timestamp, lastLoginDate: day.today,
        totalLoginDays, currentStreakDays, longestStreakDays, updatedAt: timestamp,
      }, {merge: true});
      transaction.set(historyDocument, {loggedInAt: timestamp, currentStreakDays});
      return {
        scope, historyDocument, loginDate: day.today,
        totalLoginDays, currentStreakDays, longestStreakDays, isFirstLoginOfDay: true,
      };
    });
    if (!result.isFirstLoginOfDay) return result;

    const saved = await result.historyDocument.get();
    if (!saved.exists) throw new Error("Saved student login history could not be read.");
    const loginRecord = new StudentLoginRecord({...saved.data(), ...scope, loginDate: result.loginDate});
    const summary = new StudentLoginSummary({
      ...scope, lastLoginDate: result.loginDate, lastLoginAt: loginRecord.loggedInAt,
      totalLoginDays: result.totalLoginDays, currentStreakDays: result.currentStreakDays,
      longestStreakDays: result.longestStreakDays, updatedAt: loginRecord.loggedInAt,
    });
    // Retention never changes the lifetime counters. Scheduled cleanup also covers
    // inactive students and retries a failed cleanup independently of logging.
    await this.pruneHistory(scope);
    return {loginRecord, summary, isFirstLoginOfDay: true};
  }

  async getSummary(input) {
    const scope = requireStudentLoginScope(input);
    const {today} = getLoginDayContext(this.now());
    const data = await this.readDocument(STUDENT_LOGINS_COLLECTION, scope.studentId);
    return evaluateLoginSummary(requireStoredLoginSummary(data, scope), today);
  }

  async getByDate(input) {
    const scope = requireStudentLoginDateScope(input);
    const data = await this.readDocument(historyCollectionPath(scope), scope.loginDate);
    return data === null ? null : new StudentLoginRecord({...data, ...scope});
  }

  async hasLoggedInOnDate(input) {
    const scope = requireStudentLoginDateScope(input);
    requireRetainedLoginDate(scope.loginDate, getLoginDayContext(this.now()));
    const data = await this.readDocument(historyCollectionPath(scope), scope.loginDate);
    if (data === null) return false;
    new StudentLoginRecord({...data, ...scope});
    return true;
  }

  async listHistory(input) {
    const scope = requireStudentLoginHistoryInput(input);
    const day = getLoginDayContext(this.now());
    const idField = this.documentIdField();
    let query = this.getCollectionRef(historyCollectionPath(scope))
      .where(idField, ">=", day.earliest).where(idField, "<=", day.today)
      .orderBy(idField, "desc");
    if (scope.cursor) {
      requireRetainedLoginDate(scope.cursor.loginDate, day);
      const cursorDocument = await this.getDocumentRef(historyCollectionPath(scope), scope.cursor.loginDate).get();
      if (!cursorDocument.exists) {
        const error = new Error("Student login history cursor was not found.");
        error.code = "not-found";
        throw error;
      }
      query = query.startAfter(cursorDocument);
    }
    const snapshot = await query.limit(scope.limit + 1).get();
    const entries = snapshot.docs.slice(0, scope.limit).map((record) => new StudentLoginRecord({
      ...record.data(), ...requireStudentLoginScope(scope), loginDate: record.id,
    }));
    const nextCursor = snapshot.docs.length > scope.limit
      ? {...requireStudentLoginScope(scope), loginDate: entries.at(-1).loginDate} : null;
    return {entries, nextCursor};
  }

  async pruneHistory(input) {
    const scope = requireStudentLoginScope(input);
    const {earliest} = getLoginDayContext(this.now());
    const collection = this.getCollectionRef(historyCollectionPath(scope));
    const idField = this.documentIdField();
    let deletedCount = 0;
    while (true) {
      const snapshot = await collection.where(idField, "<", earliest)
        .orderBy(idField, "asc").limit(STUDENT_LOGIN_PRUNE_BATCH_SIZE).get();
      if (!snapshot.docs.length) break;
      const batch = this.getFirestoreDb().batch();
      for (const record of snapshot.docs) {
        requireLoginDate(record.id);
        batch.delete(this.getDocumentRef(historyCollectionPath(scope), record.id));
      }
      await batch.commit();
      deletedCount += snapshot.docs.length;
    }
    return {deletedCount};
  }

  // Internal maintenance enumeration, not a feature API.
  async listStudentIds({cursor = null, limit = 100} = {}) {
    let query = this.getCollectionRef(STUDENT_LOGINS_COLLECTION).orderBy(this.documentIdField(), "asc");
    if (cursor !== null) query = query.startAfter(cursor);
    const snapshot = await query.limit(limit + 1).get();
    const studentIds = snapshot.docs.slice(0, limit).map((record) => requireStudentLoginScope({studentId: record.id}).studentId);
    return {studentIds, nextCursor: snapshot.docs.length > limit ? studentIds.at(-1) : null};
  }
}

module.exports = {FirestoreStudentLoginRepository};
