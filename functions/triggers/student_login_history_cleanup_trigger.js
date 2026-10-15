const {onSchedule} = require("firebase-functions/v2/scheduler");
const logger = require("firebase-functions/logger");
const {pruneAllStudentLoginHistory} = require("../features/student_login/application/prune_all_student_login_history");

const pruneStudentLoginHistoryDaily = onSchedule({
  schedule: "5 0 * * *",
  timeZone: "Etc/UTC",
  region: "us-central1",
  retryCount: 3,
  maxInstances: 1,
  timeoutSeconds: 540,
}, async () => {
  const result = await pruneAllStudentLoginHistory();
  logger.info("Student login history cleanup completed.", result);
});

module.exports = {pruneStudentLoginHistoryDaily};
