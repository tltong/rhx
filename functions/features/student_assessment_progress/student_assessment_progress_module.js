/**
 * assessStudentPractice({studentId: string, practiceId: string})
 *   -> Promise<AssessmentOutcome>
 *   Routes pre-assessment and normal assessment practices internally.
 *
 * getStudentTopicLevel({studentId, syllabusId, topicId})
 *   -> Promise<string|null>

 */
const {
  calculateAssessmentProgression,
  calculatePreAssessmentLevel,
  getAssessmentLevelCriteria,
} = require("../assessment_framework/assessment_framework_module");
const {
  getPracticeById,
  practiceTypes,
} = require("../practice/practice_module");
const {
  getPracticeResult,
} = require("../practice_result/practice_result_module");
const {
  getQuestionDifficulty,
} = require("../question/question_module");
const {
  getSyllabusById,
} = require("../syllabus/syllabus_module");
const {
  listCompletedPracticeIds,
} = require("../student_practice/student_practice_module");
const {
  AssessStudentPractice,
} = require("./application/assess_student_practice");
const {
  AssessPreAssessmentPractice,
} = require("./application/assess_pre_assessment_practice");
const {
  AssessNormalAssessmentPractice,
} = require("./application/assess_normal_assessment_practice");
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
const assessPreAssessmentPracticeUseCase = new AssessPreAssessmentPractice({
  studentAssessmentProgressRepository,
  getSyllabusById,
  calculatePreAssessmentLevel,
});
const assessNormalAssessmentPracticeUseCase = new AssessNormalAssessmentPractice({
  studentAssessmentProgressRepository,
  getSyllabusById,
  getAssessmentLevelCriteria,
  calculateAssessmentProgression,
  listCompletedPracticeIds,
  getPracticeById,
  getPracticeResult,
  getQuestionDifficulty,
  assessmentPracticeType: practiceTypes.ASSESSMENT,
});
const assessStudentPracticeUseCase = new AssessStudentPractice({
  getPracticeResult,
  getPracticeById,
  assessPreAssessmentPractice:
    assessPreAssessmentPracticeUseCase.execute.bind(
      assessPreAssessmentPracticeUseCase,
    ),
  assessNormalAssessmentPractice:
    assessNormalAssessmentPracticeUseCase.execute.bind(
      assessNormalAssessmentPracticeUseCase,
    ),
  preAssessmentPracticeType: practiceTypes.PRE_ASSESSMENT,
  assessmentPracticeType: practiceTypes.ASSESSMENT,
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
