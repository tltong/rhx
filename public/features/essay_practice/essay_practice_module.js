/**
 * Shared essay practice APIs. Each practice references exactly one saved essay question.
 * createEssayPractice({essayQuestionId}) -> Promise<{id, essayQuestionId}>
 * getEssayPracticeById(practiceId) -> Promise<{id, essayQuestionId}|null>
 * Storage: essayPractices/{practiceId}; independent of student assignments.
 * Web creation requires a verified site administrator; reads require sign-in.
 * No Firebase endpoints are exported.
 */
import {getEssayQuestionById} from "../essay_question_generator/essay_question_generator_module.js?v=20261017-essay-grade-min-words-v1";
import {CreateEssayPractice} from "./application/create_essay_practice.js?v=20261018-preassessment-essay-v1";
import {GetEssayPracticeById} from "./application/get_essay_practice_by_id.js?v=20261018-preassessment-essay-v1";
import {FirestoreEssayPracticeRepository} from "./infrastructure/firestore_essay_practice_repository.js?v=20261018-preassessment-essay-v1";
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

const repository = new FirestoreEssayPracticeRepository();
const create = new CreateEssayPractice({repository, getEssayQuestionById});
const get = new GetEssayPracticeById(repository);

async function createEssayPractice(input) {
  const {assertAccess} = await administratorAccess();
  return create.execute(input, {assertAccess});
}
async function getEssayPracticeById(practiceId) {
  const {assertAccess} = accountAccess();
  const result = await get.execute(practiceId);
  assertAccess();
  return result;
}

export {createEssayPractice, getEssayPracticeById};

