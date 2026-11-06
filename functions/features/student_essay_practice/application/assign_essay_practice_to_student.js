const {normalizeAssignment} = require("../domain/student_essay_practice");

class AssignEssayPracticeToStudent {
  constructor({repository, getEssayQuestionById, prepareQuestion}) {
    Object.assign(this, {repository, getEssayQuestionById, prepareQuestion});
  }
  async execute(input, context = {}) {
    const assignment = normalizeAssignment(input);
    context.assertAccess?.();
    if (assignment.essayPracticeId && this.repository.getAssigned) {
      const existing = await this.repository.getAssigned(assignment);
      context.assertAccess?.();
      if (existing && !context.preventQuestionReuse && (existing.essayQuestionId === assignment.essayQuestionId || existing.sourceEssayQuestionId === assignment.essayQuestionId) && existing.syllabusId === assignment.syllabusId && existing.topicId === assignment.topicId) return existing;
    }
    let question = await this.getEssayQuestionById(assignment.essayQuestionId);
    context.assertAccess?.();
    if (!question) throw new Error("The essay question could not be found.");
    if (!context.preventQuestionReuse && this.prepareQuestion) {
      question = await this.prepareQuestion(question.questionId);
      context.assertAccess?.();
    }
    return this.repository.assign({...assignment, essayQuestionId: question.questionId,
      ...(question.questionId === assignment.essayQuestionId ? {} : {sourceEssayQuestionId: assignment.essayQuestionId})}, context);
  }
}

module.exports = {AssignEssayPracticeToStudent};

