const {onSchedule} = require("firebase-functions/v2/scheduler");
async function processPendingStudentUsernameChanges() {
  return require("./features/student/student_profile_module").retryStudentUsernameChanges();
}
module.exports = {processPendingStudentUsernameChanges, retryStudentUsernameChanges: onSchedule({
  schedule: "every 5 minutes", timeZone: "Etc/UTC", region: "us-central1", timeoutSeconds: 120,
}, processPendingStudentUsernameChanges)};
