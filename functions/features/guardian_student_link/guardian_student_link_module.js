/**
 * Internal Functions API:
 *
 * getGuardianStudentLink({guardianId, studentId})
 *   -> Promise<GuardianStudentLink|null>
 */
const {
  GetGuardianStudentLink,
} = require("./application/get_guardian_student_link");
const {
  guardianStudentLinkStates,
} = require("./domain/guardian_student_link");
const {
  FirestoreGuardianStudentLinkRepository,
} = require(
  "./infrastructure/firestore_guardian_student_link_repository"
);

const guardianStudentLinkRepository =
  new FirestoreGuardianStudentLinkRepository();
const getGuardianStudentLinkUseCase =
  new GetGuardianStudentLink(guardianStudentLinkRepository);

async function getGuardianStudentLink(input) {
  return getGuardianStudentLinkUseCase.execute(input);
}

module.exports = {
  getGuardianStudentLink,
  guardianStudentLinkStates,
};
