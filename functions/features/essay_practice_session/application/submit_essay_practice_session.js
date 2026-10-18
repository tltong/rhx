const {requireEssayMinimumWordCount} = require("../domain/essay_word_count");

class SubmitEssayPracticeSession {
  constructor({completeAssignedEssayPractice, getAssignedEssayPractice, getCompletedEssayPractice, getEssayQuestionById}) {
    Object.assign(this, {completeAssignedEssayPractice, getAssignedEssayPractice, getCompletedEssayPractice, getEssayQuestionById});
  }

  async execute(input, {assertAccess = () => {}} = {}) {
    assertAccess();
    const completed = await this.getCompletedEssayPractice(input);
    assertAccess();
    if (!completed) {
      const assignment = await this.getAssignedEssayPractice(input);
      assertAccess();
      if (!assignment) {
        // A concurrent submission may have moved the assignment into history.
        const saved = await this.getCompletedEssayPractice(input);
        assertAccess();
        if (!saved) throw new Error("The assigned essay practice could not be found.");
      } else {
        const question = await this.getEssayQuestionById(assignment.essayQuestionId);
        assertAccess();
        if (!question) throw new Error("The essay question could not be found.");
        requireEssayMinimumWordCount(input.essayText, question.wordCountRequirement?.minWords ?? null);
      }
    }
    // The immutable saved submission is the scoring trigger's source of truth.
    const completion = await this.completeAssignedEssayPractice(input);
    assertAccess();
    return completion;
  }
}

module.exports = {SubmitEssayPracticeSession};
