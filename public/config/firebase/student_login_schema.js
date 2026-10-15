const STUDENT_LOGINS_COLLECTION = "studentLogins";
const STUDENT_LOGIN_HISTORY_SUBCOLLECTION = "history";
const STUDENT_LOGIN_TIME_ZONE = "UTC";
const STUDENT_LOGIN_HISTORY_DAYS = 45;
const DEFAULT_STUDENT_LOGIN_HISTORY_LIMIT = 25;
const MAX_STUDENT_LOGIN_HISTORY_LIMIT = STUDENT_LOGIN_HISTORY_DAYS;
const STUDENT_LOGIN_PRUNE_BATCH_SIZE = 400;

const studentLoginSchema = {
  collection: STUDENT_LOGINS_COLLECTION,
  documentId: "[student_id]",
  fields: {
    lastLoginAt: "timestamp",
    lastLoginDate: {type: "string", format: "YYYY-MM-DD", timeZone: STUDENT_LOGIN_TIME_ZONE},
    totalLoginDays: {type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER},
    currentStreakDays: {type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER},
    longestStreakDays: {type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER},
    updatedAt: "timestamp",
  },
  subcollections: {
    history: {
      collection: STUDENT_LOGIN_HISTORY_SUBCOLLECTION,
      documentId: "[login_date]",
      documentIdFormat: "YYYY-MM-DD",
      retentionDays: STUDENT_LOGIN_HISTORY_DAYS,
      fields: {
        loggedInAt: "timestamp",
        currentStreakDays: {type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER},
      },
    },
  },
};

export {STUDENT_LOGINS_COLLECTION, STUDENT_LOGIN_HISTORY_SUBCOLLECTION, STUDENT_LOGIN_TIME_ZONE, STUDENT_LOGIN_HISTORY_DAYS, DEFAULT_STUDENT_LOGIN_HISTORY_LIMIT, MAX_STUDENT_LOGIN_HISTORY_LIMIT, STUDENT_LOGIN_PRUNE_BATCH_SIZE, studentLoginSchema};
