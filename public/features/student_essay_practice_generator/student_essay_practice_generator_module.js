/**
 * generateNextStudentEssayPractice({studentId, completedEssayPracticeId})
 *   -> Promise<AssignedEssayPractice|CompletedEssayPractice>
 *
 * Reuses and assigns an unseen medium essay following a completed student essay attempt.
 * Searches the shared bank by level/grade/language/difficulty, preferring an unused theme.
 * Excludes all questions assigned to or completed by this student across topics/subjects.
 * Generates and saves a new shared question only when no unseen matching question remains.
 * Assignment atomically guards against concurrent reuse by the same student.
 * Syllabus/topic come from the completion; level/grade/language from its saved question.
 * Tries up to 10 existing random-theme selections, excluding themes from all the student's
 * completed AND assigned essays across subjects/topics. Comparisons ignore case and spacing.
 * After 10 repeated selections, uses the last selected theme. Empty seed pools still fail.
 * Calls Essay Question Generator to create/save the question, and Student Essay Practice to assign it.
 * Does not modify the syllabus's initial essay attachment or create normal student practices.
 *
 * Durable generation records: studentEssayPracticeGenerations/{studentId}/completions/{completedEssayPracticeId}.
 * One reserved next attempt ID and a 10-minute lease per source completion prevent duplicate assignments.
 * A saved question selection or draft resumes failed saves/assignments without another LLM call.
 * Retries return the same assignment, including its completion if the student already submitted it.
 * Backend calls require a trusted {updatedBy}; web generation requires a verified site administrator.
 * The backend essay-completion trigger invokes this after grading. No new Firebase endpoints.
 */
import {getCompletedEssayPractice, getAssignedEssayPractice, listCompletedEssayPractices,
  listAssignedEssayPractices, assignEssayPracticeToStudent} from "../student_essay_practice/student_essay_practice_module.js?v=20261018-essay-reuse-v1";
import {getEssayQuestionById, listEssayQuestions, generateEssayQuestion, saveEssayQuestion} from "../essay_question_generator/essay_question_generator_module.js?v=20261017-essay-grade-min-words-v1";
import {getRandomQuestionSeedEntry} from "../question_seed_generator/question_seed_generator_module.js?v=20261017-seed-association-order-v1";
import {requireCurrentFirebaseAuthUser} from "../../utils/firebase/firebase_auth.js";
import {requireCurrentSiteAdmin} from "../site_admin/site_admin_module.js?v=20260827-site-admin-guard-v1";
import {FirestoreEssayGenerationRepository} from "./infrastructure/firestore_essay_generation_repository.js?v=20261018-essay-reuse-v1";
import {GenerateNextStudentEssayPractice} from "./application/generate_next_student_essay_practice.js?v=20261018-essay-reuse-v1";

async function administratorAccess() {
  const user = requireCurrentFirebaseAuthUser();
  const assertAccess = () => {
    const current = requireCurrentFirebaseAuthUser();
    if (current.uid !== user.uid || current.email !== user.email || current.emailVerified !== user.emailVerified) {
      throw new Error("The signed-in account changed. Try again.");
    }
  };
  const status = await requireCurrentSiteAdmin();
  assertAccess();
  if (!user.emailVerified || user.email?.trim().toLowerCase() !== status.email) {
    throw new Error("The signed-in administrator account changed. Try again.");
  }
  return {uid: user.uid, assertAccess};
}

const generator = new GenerateNextStudentEssayPractice({
  repository: new FirestoreEssayGenerationRepository(), requireAdministrator: administratorAccess,
  getCompletedEssayPractice, getAssignedEssayPractice, listCompletedEssayPractices,
  listAssignedEssayPractices, assignEssayPracticeToStudent,
  getEssayQuestionById, listEssayQuestions, generateEssayQuestion, saveEssayQuestion, getRandomQuestionSeedEntry,
});

async function generateNextStudentEssayPractice(input) {return generator.execute(input);}

export {generateNextStudentEssayPractice};
