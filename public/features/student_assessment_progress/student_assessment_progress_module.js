import {AssessStudentEssayPractice} from "./application/assess_student_essay_practice.js?v=20261018-essay-progression-v1";
import {getCompletedEssayPractice} from "../student_essay_practice/student_essay_practice_module.js?v=20261018-essay-reuse-v1";
import {getEssayQuestionById} from "../essay_question_generator/essay_question_generator_module.js?v=20261017-essay-grade-min-words-v1";
import {getEssayResult} from "../essay_scoring/essay_scoring_module.js?v=20261018-topic-reset-v1";
import {requireCurrentSiteAdmin} from "../site_admin/site_admin_module.js?v=20260827-site-admin-guard-v1";
import {getStudentSyllabusSubscriptionLanguage} from "../syllabus_subscription/syllabus_subscription_module.js";
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
} from "../assessment_framework/assessment_framework_module.js?v=20261018-topic-framework-v1";
import {
  getPracticeById,
  practiceTypes
} from "../practice/practice_module.js?v=20260816-practice-question-ids";
import {
  getPracticeResult
} from "../practice_result/practice_result_module.js?v=20261018-topic-reset-v1";
import {
  getQuestionDifficulty
} from "../question/question_module.js?v=20260822-assessment-progression";
import {getSyllabusById} from "../syllabus/syllabus_module.js?v=20261018-topic-framework-v1";
import {
  AssessStudentPractice
} from "./application/assess_student_practice.js?v=20260822-assessment-progression";
import {
  AssessPreAssessmentPractice
} from "./application/assess_pre_assessment_practice.js?v=20261018-essay-progression-v1";
import {
  AssessNormalAssessmentPractice
} from "./application/assess_normal_assessment_practice.js?v=20261018-essay-progression-v1";
import {
  listCompletedPracticeIds
} from "../student_practice/student_practice_module.js?v=20261018-topic-reset-v1";
import {GetStudentPracticeAssessment} from "./application/get_student_practice_assessment.js?v=20261010-level-rewards-v1";
import {requireCurrentFirebaseAuthUser} from "../../utils/firebase/firebase_auth.js";
import {
  GetStudentTopicLevel
} from "./application/get_student_topic_level.js?v=20260814-student-topic-level";
import {
  FirestoreStudentAssessmentProgressRepository
} from "./infrastructure/firestore_student_assessment_progress_repository.js?v=20261018-essay-progression-v1";

const studentAssessmentProgressRepository =
  new FirestoreStudentAssessmentProgressRepository();
const getStudentPracticeAssessmentUseCase = new GetStudentPracticeAssessment(studentAssessmentProgressRepository);
const getStudentTopicLevelUseCase = new GetStudentTopicLevel(
  studentAssessmentProgressRepository
);
const assessPreAssessmentPracticeUseCase = new AssessPreAssessmentPractice({
  studentAssessmentProgressRepository,
  getSyllabusById,
  getStudentSyllabusSubscriptionLanguage,
  calculatePreAssessmentLevel
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

const assessEssayPracticeUseCase = new AssessStudentEssayPractice({
  studentAssessmentProgressRepository, getCompletedEssayPractice, getEssayQuestionById, getEssayResult,
  getSyllabusById, getAssessmentLevelCriteria, calculateAssessmentProgression,
});

async function assessStudentEssayPractice(input) {
  const user = requireCurrentFirebaseAuthUser();
  const assertAccess = () => {
    const current = requireCurrentFirebaseAuthUser();
    if (current.uid !== user.uid || current.email !== user.email || current.emailVerified !== user.emailVerified) throw new Error("The signed-in account changed. Try again.");
  };
  const administrator = await requireCurrentSiteAdmin();
  assertAccess();
  if (!user.emailVerified || user.email?.trim().toLowerCase() !== administrator.email) throw new Error("A verified site administrator is required.");
  return assessEssayPracticeUseCase.execute(input, {assertAccess});
}

async function assessStudentPractice(input) {
  return assessStudentPracticeUseCase.execute(input);
}

async function getStudentPracticeAssessment(input) {
  requireCurrentFirebaseAuthUser();
  return getStudentPracticeAssessmentUseCase.execute(input);
}

async function getStudentTopicLevel(input) {
  return getStudentTopicLevelUseCase.execute(input);
}

export {
  assessStudentPractice,
  assessStudentEssayPractice,
  getStudentPracticeAssessment,
  getStudentTopicLevel
};
