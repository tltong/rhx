/**
 * getStudentDashboard(studentId: string)
 *   -> Promise<{
 *     student: {id, name, country, level, currentGrade},
 *     stream: {id, name}|null,
 *     syllabuses: Array<{
 *       syllabusId, subject, language, frameworkName,
 *       topics: Array<{
 *         nextAssignedPractice: Object|null,
 *         completedPractices: Array<{
 *           practiceId, dateCompleted, practiceType, difficulty, score
 *         }>
 *       }>
 *     }>,
 *     preAssessmentStates
 *   }|null>
 *
 * createSyllabusProgressPane(input: {
 *   studentId: string,
 *   syllabuses: Array<Object>,
 *   title?: string,
 *   description?: string,
 *   practiceResultUrl?: string,
 *   documentRef?: Document
 * }) -> HTMLElement
 *
 * renderSyllabusProgressPane(input: {
 *   container: Element,
 *   studentId: string,
 *   syllabuses: Array<Object>,
 *   title?: string,
 *   description?: string,
 *   practiceResultUrl?: string,
 *   documentRef?: Document
 * }) -> HTMLElement
 */
import {
  ASSESSMENT_FRAMEWORK_END_LEVEL_ID,
  getAssessmentFrameworkById
} from "../assessment_framework/assessment_framework_module.js?v=20260823-student-dashboard-v1";
import {
  getPracticeById,
  practiceTypes
} from "../practice/practice_module.js?v=20260824-completed-practices";
import {
  getQuestionDifficulty
} from "../question/question_module.js?v=20260824-completed-practices";
import {
  getStudentById
} from "../student/student_module.js?v=20260823-student-country-v1";
import {
  getStudentTopicLevel
} from "../student_assessment_progress/student_assessment_progress_module.js?v=20260823-student-dashboard-v1";
import {
  listAssignedPractices,
  listCompletedPractices
} from "../student_practice/student_practice_module.js?v=20260824-completed-practices";
import {
  getStreamById
} from "../stream/stream_module.js?v=20260823-student-dashboard-v1";
import {
  getStudentStreamSubscription
} from "../stream_subscription/stream_subscription_module.js?v=20260823-student-dashboard-v1";
import {
  getSyllabusById
} from "../syllabus/syllabus_module.js?v=20260823-student-dashboard-v1";
import {
  listActiveStudentSyllabusSubscriptions
} from "../syllabus_subscription/syllabus_subscription_module.js?v=20260823-student-dashboard-v1";
import {
  GetStudentDashboard
} from "./application/get_student_dashboard.js?v=20260824-completed-practices";
import {
  createSyllabusProgressPane,
  renderSyllabusProgressPane
} from "./components/syllabus_progress_pane/syllabus_progress_pane.js?v=20260908-guardian-progress-pane-v1";

const getStudentDashboardUseCase = new GetStudentDashboard({
  getStudentById,
  getStudentStreamSubscription,
  getStreamById,
  listActiveStudentSyllabusSubscriptions,
  getSyllabusById,
  listCompletedPractices,
  listAssignedPractices,
  getPracticeById,
  getQuestionDifficulty,
  preAssessmentPracticeType: practiceTypes.PRE_ASSESSMENT,
  getStudentTopicLevel,
  getAssessmentFrameworkById,
  endLevelId: ASSESSMENT_FRAMEWORK_END_LEVEL_ID
});

async function getStudentDashboard(studentId) {
  return getStudentDashboardUseCase.execute(studentId);
}

export {
  createSyllabusProgressPane,
  getStudentDashboard,
  renderSyllabusProgressPane
};
