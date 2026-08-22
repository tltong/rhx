/**
 * Public API
 *
 * assessStudentPractice({studentId: string, practiceId: string})
 *   -> Promise<{
 *     assessed: boolean,
 *     reason: null|"assessment-not-supported",
 *     studentId: string,
 *     practiceId: string|null,
 *     practiceType: string|null,
 *     score: number|null,
 *     syllabusId?: string,
 *     topicId?: string,
 *     assessmentFrameworkId?: string,
 *     levelId?: string,
 *     levelName?: string,
 *     isFrameworkCompleted?: boolean,
 *     progress: StudentAssessmentTopicProgress|null
 *   }>
 *
 * getStudentTopicLevel({
 *   studentId: string,
 *   syllabusId: string,
 *   topicId: string
 * })
 *   -> Promise<string|null>

 *
 * This version persists levels for pre-assessment practices only.
 */
import {
  calculatePreAssessmentLevel
} from "../assessment_framework/assessment_framework_module.js?v=20260813-pre-assessment-progress";
import {
  getPracticeById,
  practiceTypes
} from "../practice/practice_module.js?v=20260816-practice-question-ids";
import {
  getPracticeResult
} from "../practice_result/practice_result_module.js?v=20260813-exact-practice-progress";
import {
  getSyllabusById
} from "../syllabus/syllabus_module.js?v=20260730-topic-pre-assessment";
import {
  AssessStudentPractice
} from "./application/assess_student_practice.js?v=20260813-exact-practice-progress";
import {
  GetStudentTopicLevel
} from "./application/get_student_topic_level.js?v=20260814-student-topic-level";
import {
  FirestoreStudentAssessmentProgressRepository
} from "./infrastructure/firestore_student_assessment_progress_repository.js?v=20260813-pre-assessment-progress";

const studentAssessmentProgressRepository =
  new FirestoreStudentAssessmentProgressRepository();
const getStudentTopicLevelUseCase = new GetStudentTopicLevel(
  studentAssessmentProgressRepository
);
const assessStudentPracticeUseCase = new AssessStudentPractice({
  studentAssessmentProgressRepository,
  getPracticeResult,
  getPracticeById,
  getSyllabusById,
  calculatePreAssessmentLevel,
  preAssessmentPracticeType: practiceTypes.PRE_ASSESSMENT
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
