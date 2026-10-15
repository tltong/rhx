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

/** Signed-in students can access their own records. Other students require site-admin authorization. */
import {STUDENT_LOGIN_TIME_ZONE, STUDENT_LOGIN_HISTORY_DAYS} from "../../config/firebase/student_login_schema.js?v=20261010-login-rewards-v1";
import {FirestoreStudentLoginRepository} from "./infrastructure/firestore_student_login_repository.js?v=20261010-login-reward-api-v1";
import {requireCurrentFirebaseAuthUser} from "../../utils/firebase/firebase_auth.js";
import {requireCurrentSiteAdmin} from "../site_admin/site_admin_module.js?v=20260827-site-admin-guard-v1";
import {RecordStudentLogin} from "./application/record_student_login.js?v=20261010-login-rewards-v1";
import {GetStudentLoginSummary} from "./application/get_student_login_summary.js?v=20261010-login-rewards-v1";
import {GetStudentLoginRecord} from "./application/get_student_login_record.js?v=20261010-login-reward-api-v1";
import {HasStudentLoggedInOnDate} from "./application/has_student_logged_in_on_date.js?v=20261010-login-rewards-v1";
import {ListStudentLoginHistory} from "./application/list_student_login_history.js?v=20261010-login-rewards-v1";
import {PruneStudentLoginHistory} from "./application/prune_student_login_history.js?v=20261010-login-rewards-v1";

const repository = new FirestoreStudentLoginRepository();
const recordStudentLoginUseCase = new RecordStudentLogin(repository, requireStudentLoginAccess);
const getStudentLoginSummaryUseCase = new GetStudentLoginSummary(repository, requireStudentLoginAccess);
const getStudentLoginRecordUseCase = new GetStudentLoginRecord(repository, requireStudentLoginAccess);
const hasStudentLoggedInOnDateUseCase = new HasStudentLoggedInOnDate(repository, requireStudentLoginAccess);
const listStudentLoginHistoryUseCase = new ListStudentLoginHistory(repository, requireStudentLoginAccess);
const pruneStudentLoginHistoryUseCase = new PruneStudentLoginHistory(repository, requireStudentLoginAccess);

async function requireStudentLoginAccess({studentId}) {
  const user = requireCurrentFirebaseAuthUser();
  if (user.uid === studentId) return;
  const status = await requireCurrentSiteAdmin();
  const currentUser = requireCurrentFirebaseAuthUser();
  if (currentUser.uid !== user.uid || currentUser.email?.trim().toLowerCase() !== status.email) {
    throw new Error("The signed-in account changed. Try again.");
  }
}

async function recordStudentLogin(input) { return recordStudentLoginUseCase.execute(input); }
async function getStudentLoginSummary(input) { return getStudentLoginSummaryUseCase.execute(input); }
async function getStudentLoginRecord(input) { return getStudentLoginRecordUseCase.execute(input); }
async function hasStudentLoggedInOnDate(input) { return hasStudentLoggedInOnDateUseCase.execute(input); }
async function listStudentLoginHistory(input) { return listStudentLoginHistoryUseCase.execute(input); }
async function pruneStudentLoginHistory(input) { return pruneStudentLoginHistoryUseCase.execute(input); }

export {STUDENT_LOGIN_TIME_ZONE, STUDENT_LOGIN_HISTORY_DAYS, recordStudentLogin, getStudentLoginSummary, getStudentLoginRecord, hasStudentLoggedInOnDate, listStudentLoginHistory, pruneStudentLoginHistory};
