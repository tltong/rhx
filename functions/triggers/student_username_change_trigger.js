const {onDocumentCreated} = require("firebase-functions/v2/firestore");
async function processStudentUsernameChangeEvent(event, {process = require("../features/student/student_profile_module").processStudentUsernameChange} = {}) {
  if (!event.data?.exists || event.data.data().status !== "pending") return null;
  return process(event.params.operationId);
}
module.exports = {processStudentUsernameChangeEvent, onStudentUsernameChangeRequested: onDocumentCreated({
  document: "studentCredentialChanges/{operationId}", region: "us-central1", timeoutSeconds: 120, retry: true,
}, processStudentUsernameChangeEvent)};
