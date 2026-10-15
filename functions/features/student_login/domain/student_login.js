const {STUDENT_LOGIN_HISTORY_DAYS, DEFAULT_STUDENT_LOGIN_HISTORY_LIMIT, MAX_STUDENT_LOGIN_HISTORY_LIMIT} = require("../../../schema/student_login_schema");

const DAY_MILLISECONDS = 24 * 60 * 60 * 1000;

function requireInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Student login input must be an object.");
  }
  return input;
}

function requireStudentLoginScope(input) {
  requireInput(input);
  const studentId = input.studentId;
  if (typeof studentId !== "string" || !studentId.trim() || studentId.includes("/")
      || [".", ".."].includes(studentId.trim()) || /^__.*__$/.test(studentId.trim())
      || new TextEncoder().encode(studentId.trim()).length > 1500) {
    throw new Error("studentId must be a valid document ID.");
  }
  return {studentId: studentId.trim()};
}

function requireLoginDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("loginDate must use YYYY-MM-DD format.");
  }
  const parsed = new Date(value + "T00:00:00.000Z");
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error("loginDate must be a valid calendar date.");
  }
  return value;
}

function shiftLoginDate(loginDate, days) {
  const date = new Date(requireLoginDate(loginDate) + "T00:00:00.000Z");
  date.setUTCDate(date.getUTCDate() + days);
  return requireLoginDate(date.toISOString().slice(0, 10));
}

function loginDayDifference(firstDate, secondDate) {
  return (Date.parse(requireLoginDate(secondDate)) - Date.parse(requireLoginDate(firstDate))) / DAY_MILLISECONDS;
}

function getLoginDayContext(now) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new Error("The student login clock must return a valid Date.");
  }
  const today = requireLoginDate(now.toISOString().slice(0, 10));
  return {today, earliest: shiftLoginDate(today, -(STUDENT_LOGIN_HISTORY_DAYS - 1))};
}

function requireRetainedLoginDate(loginDate, {today, earliest}) {
  const date = requireLoginDate(loginDate);
  if (date < earliest || date > today) {
    const error = new Error("loginDate must fall within the last " + STUDENT_LOGIN_HISTORY_DAYS + " UTC calendar days, including today.");
    error.code = "out-of-range";
    throw error;
  }
  return date;
}

function requireStudentLoginDateScope(input) {
  return {...requireStudentLoginScope(input), loginDate: requireLoginDate(input.loginDate)};
}

function requireStudentLoginHistoryInput(input) {
  const scope = requireStudentLoginScope(input);
  const limit = input.limit === undefined ? DEFAULT_STUDENT_LOGIN_HISTORY_LIMIT : input.limit;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_STUDENT_LOGIN_HISTORY_LIMIT) {
    throw new Error("limit must be a whole number from 1 to " + MAX_STUDENT_LOGIN_HISTORY_LIMIT + ".");
  }
  let cursor = null;
  if (input.cursor !== undefined && input.cursor !== null) {
    const cursorScope = requireStudentLoginDateScope(input.cursor);
    if (cursorScope.studentId !== scope.studentId) {
      throw new Error("cursor must belong to the requested student.");
    }
    cursor = cursorScope;
  }
  return {...scope, limit, cursor};
}

function requireLoginCounter(value, name, minimum = 1) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(name + " must be a safe integer of at least " + minimum + ".");
  }
  return value;
}

function requireLoginTimestamp(value, name) {
  const date = value instanceof Date ? value : typeof value?.toDate === "function" ? value.toDate() : null;
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
    throw new Error(name + " must be a valid timestamp.");
  }
  return new Date(date.getTime());
}

class StudentLoginSummary {
  constructor(input) {
    Object.assign(this, requireStudentLoginScope(input));
    this.lastLoginAt = requireLoginTimestamp(input.lastLoginAt, "lastLoginAt");
    this.lastLoginDate = requireLoginDate(input.lastLoginDate);
    this.totalLoginDays = requireLoginCounter(input.totalLoginDays, "totalLoginDays");
    this.currentStreakDays = requireLoginCounter(input.currentStreakDays, "currentStreakDays", 0);
    this.longestStreakDays = requireLoginCounter(input.longestStreakDays, "longestStreakDays");
    this.updatedAt = requireLoginTimestamp(input.updatedAt, "updatedAt");
    if (this.currentStreakDays > this.longestStreakDays || this.longestStreakDays > this.totalLoginDays) {
      throw new Error("Stored student login counters are inconsistent.");
    }
    Object.freeze(this);
  }
}

function requireStoredLoginSummary(data, scope) {
  if (data === null) return null;
  const summary = new StudentLoginSummary({...data, ...scope});
  requireLoginCounter(summary.currentStreakDays, "stored currentStreakDays");
  return summary;
}

function evaluateLoginSummary(summary, today) {
  if (summary === null) return null;
  return new StudentLoginSummary({
    ...summary,
    currentStreakDays: loginDayDifference(summary.lastLoginDate, today) > 1 ? 0 : summary.currentStreakDays,
  });
}

class StudentLoginRecord {
  constructor(input) {
    Object.assign(this, requireStudentLoginDateScope(input));
    this.loggedInAt = requireLoginTimestamp(input.loggedInAt, "loggedInAt");
    // Older records have only a timestamp; new records retain their day's streak.
    if (input.currentStreakDays !== undefined) {
      this.currentStreakDays = requireLoginCounter(input.currentStreakDays, "currentStreakDays");
    }
    Object.freeze(this);
  }
}

module.exports = {StudentLoginSummary, StudentLoginRecord, requireStudentLoginScope, requireLoginDate, shiftLoginDate, loginDayDifference, getLoginDayContext, requireRetainedLoginDate, requireStudentLoginDateScope, requireStudentLoginHistoryInput, requireLoginCounter, requireStoredLoginSummary, evaluateLoginSummary};
