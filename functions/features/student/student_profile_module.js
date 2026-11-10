const {getAuth} = require("firebase-admin/auth");
const {getFirebaseApp, getFirestoreDb} = require("../../utils/firebase/firebase_ops");
const {createStudentProfileAuthorizer} = require("./infrastructure/student_profile_access");
const {createStudentProfileService} = require("./application/student_profile_service");
const {createStudentCredentialsService} = require("./application/student_credentials_service");
const {createGuardianStudentLinkService} = require("../guardian_student_link/application/manage_guardian_student_link");
function createStudentProfileFeature({getDb = getFirestoreDb, auth = {getUser: uid => getAuth(getFirebaseApp()).getUser(uid),
  getUserByEmail: email => getAuth(getFirebaseApp()).getUserByEmail(email), updateUser: (uid, changes) => getAuth(getFirebaseApp()).updateUser(uid, changes)},
  now, uuid, authorize = createStudentProfileAuthorizer({getDb, getUser: uid => auth.getUser(uid), now})} = {}) {
  return {...createStudentProfileService({getDb, authorize, now}), ...createStudentCredentialsService({getDb, authorize, auth, now, uuid}),
    ...createGuardianStudentLinkService({getDb, authorize, now, verifyStudentToken: token => auth.verifyIdToken ? auth.verifyIdToken(token, true) : getAuth(getFirebaseApp()).verifyIdToken(token, true)})};
}
module.exports = {createStudentProfileFeature, ...createStudentProfileFeature()};
