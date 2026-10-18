/**
 * generateNextStudentEssayPractice({studentId, completedEssayPracticeId}, {updatedBy})
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
const {getCompletedEssayPractice, getAssignedEssayPractice, listCompletedEssayPractices,
  listAssignedEssayPractices, assignEssayPracticeToStudent} = require("../student_essay_practice/student_essay_practice_module");
const {getEssayQuestionById, listEssayQuestions, generateEssayQuestion, saveEssayQuestion} = require("../essay_question_generator/essay_question_generator_module");
const {getRandomQuestionSeedEntry} = require("../question_seed_generator/question_seed_generator_module");
const {FirestoreEssayGenerationRepository} = require("./infrastructure/firestore_essay_generation_repository");
const {GenerateNextStudentEssayPractice} = require("./application/generate_next_student_essay_practice");

const generator = new GenerateNextStudentEssayPractice({
  repository: new FirestoreEssayGenerationRepository(),
  getCompletedEssayPractice, getAssignedEssayPractice, listCompletedEssayPractices,
  listAssignedEssayPractices, assignEssayPracticeToStudent,
  getEssayQuestionById, listEssayQuestions, generateEssayQuestion, saveEssayQuestion, getRandomQuestionSeedEntry,
  requireAdministrator: async context => ({uid: context?.updatedBy}),
});

async function generateNextStudentEssayPractice(input, context) {
  const {withTopicResetGuard, hasResetGuard} = require("../../utils/student_topic_reset_guard");
  if (hasResetGuard()) return generator.execute(input, context);
  const {normalizeGenerationRequest} = require("./domain/essay_generation");
  const request = normalizeGenerationRequest(input);
  // Authorization still runs inside the use case before generation or mutation.
  if (!context?.updatedBy) return generator.execute(input, context);
  const source = await getCompletedEssayPractice({studentId: request.studentId, essayPracticeId: request.completedEssayPracticeId});
  if (!source) return generator.execute(input, context);
  return withTopicResetGuard({studentId: request.studentId, createdAt: source.completedAt,
    scopes: [{syllabusId: source.syllabusId, topicId: source.topicId}]}, () => generator.execute(input, context));
}

module.exports = {generateNextStudentEssayPractice};
