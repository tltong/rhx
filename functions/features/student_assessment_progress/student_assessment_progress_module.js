const {AssessStudentEssayPractice} = require("./application/assess_student_essay_practice");
const {getCompletedEssayPractice} = require("../student_essay_practice/student_essay_practice_module");
const {getEssayQuestionById} = require("../essay_question_generator/essay_question_generator_module");
const {getEssayResult} = require("../essay_scoring/essay_scoring_module");
const {getStudentSyllabusSubscriptionLanguage} = require("../syllabus_subscription/syllabus_subscription_module");
/**
 * assessStudentPractice({studentId: string, practiceId: string})
 *   -> Promise<AssessmentOutcome>
 *   Routes pre-assessment and normal assessment practices internally.
 *
 * assessStudentEssayPractice({studentId, essayPracticeId}) -> Promise<AssessmentOutcome>
 * Uses the essay topic/language framework. Starts at its first level without pre-assessment.
 * Each graded essay is counted at one level; qualifying scores and required essay count
 * determine advancement. Saved outcomes and a topic revision make retries/concurrency safe.
 * Missing/non-essay frameworks skip progression. Web writes require a verified site admin.
 *
 * getStudentPracticeAssessment({studentId, practiceId}) -> Promise<PracticeAssessment|null>
 * Read-only. Returns the original assessment and ordered reachedLevelIds.
 * Assessment progress and this record are saved atomically; retries replay it.
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
const {getSyllabusById} = require("../syllabus/syllabus_module");
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
const {GetStudentPracticeAssessment} = require("./application/get_student_practice_assessment");
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
const getStudentPracticeAssessmentUseCase = new GetStudentPracticeAssessment(studentAssessmentProgressRepository);
const getStudentTopicLevelUseCase = new GetStudentTopicLevel(
  studentAssessmentProgressRepository,
);
const assessPreAssessmentPracticeUseCase = new AssessPreAssessmentPractice({
  studentAssessmentProgressRepository,
  getSyllabusById,
  getStudentSyllabusSubscriptionLanguage,
  calculatePreAssessmentLevel,
});
const assessNormalAssessmentPracticeUseCase = new AssessNormalAssessmentPractice({
  studentAssessmentProgressRepository,
  getSyllabusById,
  getStudentSyllabusSubscriptionLanguage,
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

const assessEssayPracticeUseCase = new AssessStudentEssayPractice({
  studentAssessmentProgressRepository, getCompletedEssayPractice, getEssayQuestionById, getEssayResult,
  getSyllabusById, getAssessmentLevelCriteria, calculateAssessmentProgression,
});

async function assessStudentEssayPractice(input) {
  const {withTopicResetGuard, hasResetGuard} = require("../../utils/student_topic_reset_guard");
  if (hasResetGuard()) return assessEssayPracticeUseCase.execute(input);
  const {requirePracticeAssessmentScope} = require("./domain/practice_assessment");
  const scope = requirePracticeAssessmentScope({studentId: input?.studentId, practiceId: input?.essayPracticeId});
  const source = await getCompletedEssayPractice({studentId: scope.studentId, essayPracticeId: scope.practiceId});
  if (!source) return assessEssayPracticeUseCase.execute(input);
  return withTopicResetGuard({studentId: scope.studentId, createdAt: source.completedAt,
    scopes: [{syllabusId: source.syllabusId, topicId: source.topicId}]}, () => assessEssayPracticeUseCase.execute(input));
}

async function assessStudentPractice(input) {
  return assessStudentPracticeUseCase.execute(input);
}

async function getStudentPracticeAssessment(input) {
  return getStudentPracticeAssessmentUseCase.execute(input);
}

async function getStudentTopicLevel(input) {
  return getStudentTopicLevelUseCase.execute(input);
}

module.exports = {
  assessStudentPractice,
  assessStudentEssayPractice,
  getStudentPracticeAssessment,
  getStudentTopicLevel,
};
