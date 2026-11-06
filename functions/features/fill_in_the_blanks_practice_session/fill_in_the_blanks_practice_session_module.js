const {id, problem, publicPassage} = require("../fill_in_the_blanks_question_generator/domain/fill_in_the_blanks");
const {withTopicResetGuard, hasResetGuard} = require("../../utils/student_topic_reset_guard");
function createFillInTheBlanksPracticeSession({students = require("../student_fill_in_the_blanks_practice/student_fill_in_the_blanks_practice_module"),
  practices = require("../fill_in_the_blanks_practice/fill_in_the_blanks_practice_module"),
  questions = require("../fill_in_the_blanks_question_generator/fill_in_the_blanks_question_generator_module"),
  scoring = require("../fill_in_the_blanks_scoring/fill_in_the_blanks_scoring_module")} = {}) {
  const api = {
    async loadFillInTheBlanksPracticeSession(input) {
      const scope = {studentId: id(input.studentId), practiceId: id(input.practiceId)};
      const completed = await students.getCompletedFillInTheBlanksPractice(scope);
      const assignment = completed ?? await students.getAssignedFillInTheBlanksPractice(scope);
      if (!assignment) throw problem("This practice is not assigned to the student.", "not-found");
      const practice = await practices.getFillInTheBlanksPracticeById(scope.practiceId);
      if (!practice || practice.passageId !== assignment.passageId) throw problem("The practice definition is missing or inconsistent.", "failed-precondition");
      const passage = await questions.getFillInTheBlanksQuestionById(practice.passageId);
      if (!passage) throw problem("The passage could not be loaded.", "not-found");
      const result = await scoring.getFillInTheBlanksResult(scope);
      const submission = students.getFillInTheBlanksSubmission ? await students.getFillInTheBlanksSubmission(scope) : null;
      const processing = completed && students.getFillInTheBlanksCompletionProcessing ? await students.getFillInTheBlanksCompletionProcessing(scope) : null;
      return {status: completed ? "completed" : "assigned", assignment, practice, passage: publicPassage(passage), result, submission, processing};
    },
    async submitFillInTheBlanksPracticeSession(input) {
      const loaded = await api.loadFillInTheBlanksPracticeSession(input);
      if (loaded.status === "completed") return loaded;
      const operation = async () => {
        const submission = await students.claimFillInTheBlanksSubmission(input, loaded.passage.questions, loaded.passage.language);
        if (submission.completed) return api.loadFillInTheBlanksPracticeSession(input);
        try {
          const existing = await scoring.getFillInTheBlanksResult(input);
          if (!existing) {
            const outcome = await scoring.scoreFillInTheBlanks({passageId: loaded.passage.passageId, answers: submission.answers});
            await scoring.saveFillInTheBlanksResult(input, outcome, submission);
          }
          await students.completeAssignedFillInTheBlanksPractice(input);
          return api.loadFillInTheBlanksPracticeSession(input);
        } catch (error) {
          await students.failFillInTheBlanksSubmission(input, submission.leaseToken, error.code).catch(() => {});
          throw error;
        }
      };
      return hasResetGuard() ? operation() : withTopicResetGuard({studentId: input.studentId,
        scopes: [{syllabusId: loaded.practice.syllabusId, topicId: loaded.practice.topicId}]}, operation);
    },
  };
  return api;
}
module.exports = {...createFillInTheBlanksPracticeSession(), createFillInTheBlanksPracticeSession};
