/**
 * assessStudentPractice({studentId: string, practiceId: string})
 *   -> Promise<AssessmentOutcome>
 *
 * getStudentTopicLevel({studentId, syllabusId, topicId})
 *   -> Promise<string|null>

 *
 * This version persists levels for pre-assessment practices only.
 */
const {
  calculatePreAssessmentLevel,
} = require("../assessment_framework/assessment_framework_module");
const {
  getPracticeById,
  practiceTypes,
} = require("../practice/practice_module");
const {
  getPracticeResult,
} = require("../practice_result/practice_result_module");
const {
  getSyllabusById,
} = require("../syllabus/syllabus_module");
const {
  AssessStudentPractice,
} = require("./application/assess_student_practice");
const {
  GetStudentTopicLevel,
} = require("./application/get_student_topic_level");
const {
  FirestoreStudentAssessmentProgressRepository,
} = require(
  "./infrastructure/firestore_student_assessment_progress_repository",
);

const studentAssessmentProgressRepository =
  new FirestoreStudentAssessmentProgressRepository();
const getStudentTopicLevelUseCase = new GetStudentTopicLevel(
  studentAssessmentProgressRepository,
);
const assessStudentPracticeUseCase = new AssessStudentPractice({
  studentAssessmentProgressRepository,
  getPracticeResult,
  getPracticeById,
  getSyllabusById,
  calculatePreAssessmentLevel,
  preAssessmentPracticeType: practiceTypes.PRE_ASSESSMENT,
});

async function assessStudentPractice(input) {
  return assessStudentPracticeUseCase.execute(input);
}

async function getStudentTopicLevel(input) {
  return getStudentTopicLevelUseCase.execute(input);
}

module.exports = {
  assessStudentPractice,
  getStudentTopicLevel,
};
