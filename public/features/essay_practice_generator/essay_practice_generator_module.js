import {getAssessmentFrameworkById} from "../assessment_framework/assessment_framework_module.js?v=20261105-mcq-adoption-v1";
/**
 * Generates one essay practice at the first framework level's difficulty and attaches it to a syllabus topic/language.
 * generateEssayPractice({syllabusId, topicId, language}, backendContext?)
 *   -> Promise<{practice, assignment, question, questions, syllabusId, topicId, topicName, language, replacement}>
 * loadEssayPractice({syllabusId, topicId, language}) -> Promise<object|null>
 * Level and grade come from the syllabus; the seed is one matching random theme.
 * Uses the topic/language essay framework; no student assignment or Firebase endpoints.
 * Backend generation requires trusted {updatedBy}; web generation requires a verified site administrator.
 */
import {getSyllabusById, assignTopicPreAssessmentPractice} from "../syllabus/syllabus_module.js?v=20261105-mcq-adoption-v1";
import {getRandomQuestionSeedEntry} from "../question_seed_generator/question_seed_generator_module.js?v=20261104-fill-preassessment-v3";
import {generateEssayQuestion, getEssayQuestionById} from "../essay_question_generator/essay_question_generator_module.js?v=20261112-essay-variation-v1";
import {createEssayPractice, getEssayPracticeById} from "../essay_practice/essay_practice_module.js?v=20261112-essay-variation-v1";
import {GenerateEssayPractice} from "./application/generate_essay_practice.js?v=20261109-subject-assessment-generation-v1";
import {requireCurrentFirebaseAuthUser} from "../../utils/firebase/firebase_auth.js";
import {requireCurrentSiteAdmin} from "../site_admin/site_admin_module.js?v=20260827-site-admin-guard-v1";

function accountAccess() {
  const user = requireCurrentFirebaseAuthUser();
  const assertAccess = () => {
    const current = requireCurrentFirebaseAuthUser();
    if (current.uid !== user.uid || current.email !== user.email || current.emailVerified !== user.emailVerified) {
      throw new Error("The signed-in account changed. Try again.");
    }
  };
  return {user, assertAccess};
}
async function administratorAccess() {
  const access = accountAccess();
  const status = await requireCurrentSiteAdmin();
  access.assertAccess();
  if (!access.user.emailVerified || access.user.email?.trim().toLowerCase() !== status.email) {
    throw new Error("The signed-in administrator account changed. Try again.");
  }
  return {...access, uid: access.user.uid};
}

const generator = new GenerateEssayPractice({
  getAssessmentFrameworkById, getSyllabusById, assignTopicPreAssessmentPractice, getRandomQuestionSeedEntry,
  generateEssayQuestion, getEssayQuestionById, createEssayPractice, getEssayPracticeById,
  requireAdministrator: administratorAccess,
});
async function generateEssayPractice(input) {return generator.execute(input);}
async function loadEssayPractice(input) {
  const {assertAccess} = accountAccess();
  const result = await generator.load(input);
  assertAccess();
  return result;
}

export {generateEssayPractice, loadEssayPractice};

