const {normalizeAssignment} = require("../domain/student_essay_practice");

class AssignEssayPracticeToStudent {
  constructor({repository, getEssayQuestionById}) {
    Object.assign(this, {repository, getEssayQuestionById});
  }
  async execute(input, context = {}) {
    const assignment = normalizeAssignment(input);
    context.assertAccess?.();
    const question = await this.getEssayQuestionById(assignment.essayQuestionId);
    context.assertAccess?.();
    if (!question) throw new Error("The essay question could not be found.");
    return this.repository.assign(assignment, context);
  }
}

module.exports = {AssignEssayPracticeToStudent};

