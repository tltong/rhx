import {listCompletedFillInTheBlanksPractices} from "../student_fill_in_the_blanks_practice/student_fill_in_the_blanks_practice_module.js?v=20261104-fill-preassessment-v3";
import {getFillInTheBlanksPracticeById} from "../fill_in_the_blanks_practice/fill_in_the_blanks_practice_module.js?v=20261104-fill-preassessment-v3";
import {listCompletedEssayPractices} from "../student_essay_practice/student_essay_practice_module.js?v=20261104-fill-preassessment-v3";
import {getEssayPracticeById} from "../essay_practice/essay_practice_module.js?v=20261104-fill-preassessment-v3";
import {getEssayResult} from "../essay_scoring/essay_scoring_module.js?v=20261104-fill-preassessment-v3";
/**
 * getStudentDashboard(studentId: string)
 *   -> Promise<{
 *     student: {id, name, country, level, currentGrade},
 *     stream: {id, name}|null,
 *     syllabuses: Array<{
 *       syllabusId, subject, language, frameworkNames,
 *       readinessScore: number|null, readinessUnavailable: boolean,
 *       reliabilityScore: number|null, reliabilityUnavailable: boolean,
 *       topics: Array<{
 *         readinessScore: number|null, readinessUnavailable: boolean,
 *         reliabilityScore: number|null, reliabilityUnavailable: boolean,
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
} from "../assessment_framework/assessment_framework_module.js?v=20261105-mcq-adoption-v1";
import {
  getPracticeById,
  practiceTypes
} from "../practice/practice_module.js?v=20261104-fill-preassessment-v3";
import {
  getQuestionDifficulty
} from "../question/question_module.js?v=20261104-fill-preassessment-v3";
import {
  getStudentById
} from "../student/student_module.js?v=20261110-student-profile-v1";
import {
  getStudentTopicLevel
} from "../student_assessment_progress/student_assessment_progress_module.js?v=20261105-mcq-adoption-v1";
import {
  getReadinessScore,
  getSubjectReadinessScore
} from "../readiness/readiness_module.js?v=20261104-fill-preassessment-v3";
import {
  getTopicReliabilityScore,
  getSubjectReliabilityScore
} from "../reliability/reliability_module.js?v=20261104-fill-preassessment-v3";
import {
  listCompletedPractices
} from "../student_practice/student_practice_module.js?v=20261104-fill-preassessment-v3";
import {
  getStreamById
} from "../stream/stream_module.js?v=20261104-fill-preassessment-v3";
import {
  getStudentStreamSubscription
} from "../stream_subscription/stream_subscription_module.js?v=20261110-student-profile-v1";
import {
  getSyllabusById
} from "../syllabus/syllabus_module.js?v=20261105-mcq-adoption-v1";
import {
  listActiveStudentSyllabusSubscriptions
} from "../syllabus_subscription/syllabus_subscription_module.js?v=20261110-student-profile-v1";
import {
  GetStudentDashboard
} from "./application/get_student_dashboard.js?v=20261110-student-profile-v1";
import {
  createSyllabusProgressPane,
  renderSyllabusProgressPane
} from "./components/syllabus_progress_pane/syllabus_progress_pane.js?v=20261105-topic-framework-v1";

const getStudentDashboardUseCase = new GetStudentDashboard({
  getStudentById,
  getStudentStreamSubscription,
  getStreamById,
  listActiveStudentSyllabusSubscriptions,
  getSyllabusById,
  listCompletedPractices,
  listCompletedEssayPractices, listCompletedFillInTheBlanksPractices, getFillInTheBlanksPracticeById, getEssayPracticeById, getEssayResult,
  getPracticeById,
  getQuestionDifficulty,
  preAssessmentPracticeType: practiceTypes.PRE_ASSESSMENT,
  getStudentTopicLevel,
  getReadinessScore,
  getSubjectReadinessScore,
  getTopicReliabilityScore,
  getSubjectReliabilityScore,
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
