/**
 * Feature APIs; none are Firebase callable endpoints.
 * recordStudentLogin({studentId})
 *   -> Promise<{loginRecord: StudentLoginRecord, summary: StudentLoginSummary, isFirstLoginOfDay: boolean}>
 *   Uses UTC days, writes once per day in a transaction, and prunes expired history on a new day.
 *   Same-day calls make no writes. Timestamps come from Firestore; input dates/timestamps are ignored.
 * getStudentLoginSummary({studentId}) -> Promise<StudentLoginSummary|null>
 *   Evaluates the current streak as of today without changing stored lifetime counters.
 * getStudentLoginRecord({studentId, loginDate}) -> Promise<StudentLoginRecord|null>
 *   Reads the exact saved day, including its original streak snapshot. Returns null
 *   when missing or pruned; pending cleanup can leave older records readable.
 * hasStudentLoggedInOnDate({studentId, loginDate}) -> Promise<boolean>
 *   Requires a real YYYY-MM-DD date within today and the previous 44 UTC dates.
 * listStudentLoginHistory({studentId, limit?, cursor?})
 *   -> Promise<{entries: StudentLoginRecord[], nextCursor: object|null}>
 *   Newest first; default limit 25, maximum 45. Pass nextCursor unchanged.
 *   Out-of-window dates/cursors fail with "out-of-range"; missing cursors fail with "not-found".
 * pruneStudentLoginHistory({studentId}) -> Promise<{deletedCount: number}>
 *   Deletes only expired history, in bounded batches; preserves summary/lifetime statistics.
 * StudentLoginRecord: {studentId, loginDate, loggedInAt: Date, currentStreakDays?}
 * New records snapshot their streak for backend reward processing; older records may omit it.
 * StudentLoginSummary: {studentId, lastLoginAt: Date, lastLoginDate, totalLoginDays,
 *   currentStreakDays, longestStreakDays, updatedAt: Date}
 * Reads create no login records. Coin awards are processed asynchronously by the backend login trigger.
 */

/** APIs are for trusted backend callers, including triggers and maintenance jobs. */
const {STUDENT_LOGIN_TIME_ZONE, STUDENT_LOGIN_HISTORY_DAYS} = require("../../schema/student_login_schema");
const {FirestoreStudentLoginRepository} = require("./infrastructure/firestore_student_login_repository");
const {RecordStudentLogin} = require("./application/record_student_login");
const {GetStudentLoginSummary} = require("./application/get_student_login_summary");
const {GetStudentLoginRecord} = require("./application/get_student_login_record");
const {HasStudentLoggedInOnDate} = require("./application/has_student_logged_in_on_date");
const {ListStudentLoginHistory} = require("./application/list_student_login_history");
const {PruneStudentLoginHistory} = require("./application/prune_student_login_history");

const repository = new FirestoreStudentLoginRepository();
const recordStudentLoginUseCase = new RecordStudentLogin(repository);
const getStudentLoginSummaryUseCase = new GetStudentLoginSummary(repository);
const getStudentLoginRecordUseCase = new GetStudentLoginRecord(repository);
const hasStudentLoggedInOnDateUseCase = new HasStudentLoggedInOnDate(repository);
const listStudentLoginHistoryUseCase = new ListStudentLoginHistory(repository);
const pruneStudentLoginHistoryUseCase = new PruneStudentLoginHistory(repository);

async function recordStudentLogin(input) { return recordStudentLoginUseCase.execute(input); }
async function getStudentLoginSummary(input) { return getStudentLoginSummaryUseCase.execute(input); }
async function getStudentLoginRecord(input) { return getStudentLoginRecordUseCase.execute(input); }
async function hasStudentLoggedInOnDate(input) { return hasStudentLoggedInOnDateUseCase.execute(input); }
async function listStudentLoginHistory(input) { return listStudentLoginHistoryUseCase.execute(input); }
async function pruneStudentLoginHistory(input) { return pruneStudentLoginHistoryUseCase.execute(input); }

module.exports = {STUDENT_LOGIN_TIME_ZONE, STUDENT_LOGIN_HISTORY_DAYS, recordStudentLogin, getStudentLoginSummary, getStudentLoginRecord, hasStudentLoggedInOnDate, listStudentLoginHistory, pruneStudentLoginHistory};
