/**
 * generateNextStudentEssayPractice({studentId, completedEssayPracticeId})
 *   -> Promise<AssignedEssayPractice|CompletedEssayPractice>
 *
 * Reuses and assigns an unseen medium essay following a completed student essay attempt.
 * Reads the full theme pool for the source question's level/grade, excluding themes from
 * all the student's completed AND assigned essays across subjects/topics (case/spacing ignored).
 * Reuses an unseen matching question only from an eligible unused theme; otherwise generates one.
 * When no unused eligible themes remain (including an empty pool), calls Question Seed Generator's
 * getDefaultQuestionSeedTheme() and generates a fresh question using that default ("latest news").
 * This theme label does not itself retrieve current news. Seed read failures propagate.
 * Excludes all questions assigned to or completed by this student across topics/subjects.
 * Assignment atomically guards against concurrent question reuse by the same student.
 * Syllabus/topic come from the completion; level/grade/language from its saved question.
 * Saved retry selections are rechecked against the current pool and student history.
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
import {getQuestionSeedEntries, getDefaultQuestionSeedTheme} from "../question_seed_generator/question_seed_generator_module.js?v=20261020-default-theme-v1";
import {requireCurrentFirebaseAuthUser} from "../../utils/firebase/firebase_auth.js";
import {requireCurrentSiteAdmin} from "../site_admin/site_admin_module.js?v=20260827-site-admin-guard-v1";
import {FirestoreEssayGenerationRepository} from "./infrastructure/firestore_essay_generation_repository.js?v=20261018-essay-reuse-v1";
import {GenerateNextStudentEssayPractice} from "./application/generate_next_student_essay_practice.js?v=20261020-theme-pool-v1";

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
  getEssayQuestionById, listEssayQuestions, generateEssayQuestion, saveEssayQuestion, getQuestionSeedEntries, getDefaultQuestionSeedTheme,
});

async function generateNextStudentEssayPractice(input) {return generator.execute(input);}

export {generateNextStudentEssayPractice};
