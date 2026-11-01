import {requireStudentSubscriptionAccess} from "../syllabus_subscription/student_access_module.js?v=20261031-subscription-cancel-v1";
/**
 * loadEssayPracticeSession({studentId, essayPracticeId}) -> {status, practice, question, result|null}
 * submitEssayPracticeSession({studentId, essayPracticeId, essayText, timeTakenSeconds}) -> saved completion
 * Enforces the saved question's minimum word count for new submissions.
 * Saves the submission before asynchronous backend scoring. No new Firebase callable.
 */
import {getAssignedEssayPractice, getCompletedEssayPractice, completeAssignedEssayPractice}
  from "../student_essay_practice/student_essay_practice_module.js?v=20261018-essay-reuse-v1";
import {getEssayQuestionById} from "../essay_question_generator/essay_question_generator_module.js?v=20261017-essay-grade-min-words-v1";
import {getEssayResult} from "../essay_scoring/essay_scoring_module.js?v=20261018-essay-review-comment-v1";
import {requireCurrentFirebaseAuthUser} from "../../utils/firebase/firebase_auth.js";
import {LoadEssayPracticeSession} from "./application/load_essay_practice_session.js?v=20261018-essay-session-v1";
import {SubmitEssayPracticeSession} from "./application/submit_essay_practice_session.js?v=20261018-essay-min-word-count-v1";
const load = new LoadEssayPracticeSession({getAssignedEssayPractice, getCompletedEssayPractice, getEssayQuestionById, getEssayResult});
const submit = new SubmitEssayPracticeSession({completeAssignedEssayPractice, getAssignedEssayPractice, getCompletedEssayPractice, getEssayQuestionById});
async function withAccess(operation, input) {
 const user = requireCurrentFirebaseAuthUser();
 if (input?.studentId !== user.uid) throw new Error("This essay belongs to a different student.");
 const billingAccess = await requireStudentSubscriptionAccess(user.uid);
 const assertAccess = () => {
   if (billingAccess.expiresAt && billingAccess.expiresAt <= new Date()) throw Object.assign(new Error("Subscription access is suspended."), {code: "subscription-suspended"});
   const current = requireCurrentFirebaseAuthUser();
   if (current.uid !== user.uid || current.email !== user.email || current.emailVerified !== user.emailVerified) {
     throw new Error("The signed-in account changed. Try again.");
   }
 };
 const result = await operation.execute(input, {assertAccess});
 assertAccess();
 return result;
}
async function loadEssayPracticeSession(input) {return withAccess(load, input);}
async function submitEssayPracticeSession(input) {return withAccess(submit, input);}
export {loadEssayPracticeSession, submitEssayPracticeSession};
