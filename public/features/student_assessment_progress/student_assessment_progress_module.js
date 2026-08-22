/**
 * Public API
 *
 * assessStudentPractice({studentId: string, practiceId: string})
 *   -> Promise<{
 *     assessed: boolean,
 *     reason: string|null,
 *     studentId: string,
 *     practiceId: string|null,
 *     practiceType: string|null,
 *     score: number|null,
 *     syllabusId?: string,
 *     topicId?: string,
 *     assessmentFrameworkId?: string,
 *     previousLevelId?: string|null,
 *     levelId?: string,
 *     levelName?: string,
 *     levelChanged?: boolean,
 *     isFrameworkCompleted?: boolean,
 *     progress: StudentAssessmentTopicProgress|null
 *   }>
 *   Routes pre-assessment and normal assessment practices internally.
 *
 * getStudentTopicLevel({
 *   studentId: string,
 *   syllabusId: string,
 *   topicId: string
 * })
 *   -> Promise<string|null>

 */
import {
  calculateAssessmentProgression,
  calculatePreAssessmentLevel,
  getAssessmentLevelCriteria
} from "../assessment_framework/assessment_framework_module.js?v=20260822-assessment-progression";
import {
  getPracticeById,
  practiceTypes
} from "../practice/practice_module.js?v=20260816-practice-question-ids";
import {
  getPracticeResult
} from "../practice_result/practice_result_module.js?v=20260813-exact-practice-progress";
import {
  getQuestionDifficulty
} from "../question/question_module.js?v=20260822-assessment-progression";
import {
  getSyllabusById
} from "../syllabus/syllabus_module.js?v=20260730-topic-pre-assessment";
import {
  AssessStudentPractice
} from "./application/assess_student_practice.js?v=20260822-assessment-progression";
import {
  AssessPreAssessmentPractice
} from "./application/assess_pre_assessment_practice.js?v=20260822-assessment-progression";
import {
  AssessNormalAssessmentPractice
} from "./application/assess_normal_assessment_practice.js?v=20260822-assessment-progression";
import {
  listCompletedPracticeIds
} from "../student_practice/student_practice_module.js?v=20260822-assessment-progression";
import {
  GetStudentTopicLevel
} from "./application/get_student_topic_level.js?v=20260814-student-topic-level";
import {
  FirestoreStudentAssessmentProgressRepository
} from "./infrastructure/firestore_student_assessment_progress_repository.js?v=20260822-assessment-progression";

const studentAssessmentProgressRepository =
  new FirestoreStudentAssessmentProgressRepository();
const getStudentTopicLevelUseCase = new GetStudentTopicLevel(
  studentAssessmentProgressRepository
);
const assessPreAssessmentPracticeUseCase = new AssessPreAssessmentPractice({
  studentAssessmentProgressRepository,
  getSyllabusById,
  calculatePreAssessmentLevel
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
  assessmentPracticeType: practiceTypes.ASSESSMENT
});
const assessStudentPracticeUseCase = new AssessStudentPractice({
  getPracticeResult,
  getPracticeById,
  assessPreAssessmentPractice:
    assessPreAssessmentPracticeUseCase.execute.bind(
      assessPreAssessmentPracticeUseCase
    ),
  assessNormalAssessmentPractice:
    assessNormalAssessmentPracticeUseCase.execute.bind(
      assessNormalAssessmentPracticeUseCase
    ),
  preAssessmentPracticeType: practiceTypes.PRE_ASSESSMENT,
  assessmentPracticeType: practiceTypes.ASSESSMENT
});

async function assessStudentPractice(input) {
  return assessStudentPracticeUseCase.execute(input);
}

async function getStudentTopicLevel(input) {
  return getStudentTopicLevelUseCase.execute(input);
}

export {
  assessStudentPractice,
  getStudentTopicLevel
};
