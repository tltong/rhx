/**
 * getStudentSyllabusSubscriptionLanguage(
 *   studentId: string,
 *   syllabusId: string
 * ) -> Promise<string|null>
 *
 * Returns null when the student has no subscription for the syllabus.
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

const syllabusSubscriptionRepository =
  new FirestoreSyllabusSubscriptionRepository();
const getStudentSyllabusSubscriptionLanguageUseCase =
  new GetStudentSyllabusSubscriptionLanguage(
    syllabusSubscriptionRepository,
  );

async function getStudentSyllabusSubscriptionLanguage(
  studentId,
  syllabusId,
) {
  return getStudentSyllabusSubscriptionLanguageUseCase.execute(
    studentId,
    syllabusId,
  );
}

module.exports = {
  getStudentSyllabusSubscriptionLanguage,
};
