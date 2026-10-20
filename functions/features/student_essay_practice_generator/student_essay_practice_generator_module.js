/**
 * generateNextStudentEssayPractice({studentId, completedEssayPracticeId}, {updatedBy})
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
const {getCompletedEssayPractice, getAssignedEssayPractice, listCompletedEssayPractices,
  listAssignedEssayPractices, assignEssayPracticeToStudent} = require("../student_essay_practice/student_essay_practice_module");
const {getEssayQuestionById, listEssayQuestions, generateEssayQuestion, saveEssayQuestion} = require("../essay_question_generator/essay_question_generator_module");
const {getQuestionSeedEntries, getDefaultQuestionSeedTheme} = require("../question_seed_generator/question_seed_generator_module");
const {FirestoreEssayGenerationRepository} = require("./infrastructure/firestore_essay_generation_repository");
const {GenerateNextStudentEssayPractice} = require("./application/generate_next_student_essay_practice");

const generator = new GenerateNextStudentEssayPractice({
  repository: new FirestoreEssayGenerationRepository(),
  getCompletedEssayPractice, getAssignedEssayPractice, listCompletedEssayPractices,
  listAssignedEssayPractices, assignEssayPracticeToStudent,
  getEssayQuestionById, listEssayQuestions, generateEssayQuestion, saveEssayQuestion, getQuestionSeedEntries, getDefaultQuestionSeedTheme,
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
