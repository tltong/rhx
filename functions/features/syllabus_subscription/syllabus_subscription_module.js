/**
 * getStudentSyllabusSubscriptionLanguage(
 *   studentId: string,
 *   syllabusId: string
 * ) -> Promise<string|null>
 *
 * Returns null when the student has no subscription for the syllabus.
 *
 * listAvailableSyllabusesForStudent(
 *   studentId: string
 * ) -> Promise<Array<{syllabusId: string, language: string}>>
 *
 * Returns the syllabus-language pairs assigned to the student's current
 * stream year. Returns an empty array when no stream or year is assigned.
 */
const {
  GetStudentSyllabusSubscriptionLanguage,
} = require(
  "./application/get_student_syllabus_subscription_language",
);
const {
  FirestoreSyllabusSubscriptionRepository,
} = require(
  "./infrastructure/firestore_syllabus_subscription_repository",
);
const {
  ListAvailableSyllabusesForStudent,
} = require(
  "./application/list_available_syllabuses_for_student",
);
const {
  getStudentById,
} = require("../student/student_module");
const {
  getStudentStreamSubscription,
} = require("../stream_subscription/stream_subscription_module");
const {
  getStreamById,
} = require("../stream/stream_module");

const syllabusSubscriptionRepository =
  new FirestoreSyllabusSubscriptionRepository();
const getStudentSyllabusSubscriptionLanguageUseCase =
  new GetStudentSyllabusSubscriptionLanguage(
    syllabusSubscriptionRepository,
  );
const listAvailableSyllabusesForStudentUseCase =
  new ListAvailableSyllabusesForStudent({
    getStudentById,
    getStudentStreamSubscription,
    getStreamById,
  });

async function getStudentSyllabusSubscriptionLanguage(
  studentId,
  syllabusId,
) {
  return getStudentSyllabusSubscriptionLanguageUseCase.execute(
    studentId,
    syllabusId,
  );
}

async function listAvailableSyllabusesForStudent(studentId) {
  return listAvailableSyllabusesForStudentUseCase.execute(studentId);
}

module.exports = {
  getStudentSyllabusSubscriptionLanguage,
  listAvailableSyllabusesForStudent,
};
