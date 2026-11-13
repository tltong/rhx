const {normalizeAssignment} = require("../domain/student_essay_practice");

class AssignEssayPracticeToStudent {
  constructor({repository, getEssayQuestionById, prepareQuestion, prepareForStudent}) {
    Object.assign(this, {repository, getEssayQuestionById, prepareQuestion, prepareForStudent});
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
    if (!context.typeSelection && this.prepareForStudent) {
      let lastError;
      for (let attempt = 0; attempt < 10; attempt++) {
        const selected = await this.prepareForStudent({studentId: assignment.studentId, questionId: assignment.essayQuestionId,
          syllabusId: assignment.syllabusId, topicId: assignment.topicId});
        context.assertAccess?.();
        try {
          return await this.repository.assign({...assignment, essayQuestionId: selected.question.questionId,
            sourceEssayQuestionId: assignment.essayQuestionId}, {...context, preventQuestionReuse: true,
            typeSelection: selected.selection, questionMetadata: selected.question});
        } catch (error) {
          if (!["essay-question-already-used", "essay-type-selection-conflict", "essay-question-not-in-pool"].includes(error.code)) throw error;
          lastError = error;
        }
      }
      throw lastError;
    }
    if (!context.preventQuestionReuse && this.prepareQuestion) {
      question = await this.prepareQuestion(question.questionId);
      context.assertAccess?.();
    }
    return this.repository.assign({...assignment, essayQuestionId: question.questionId,
      ...(question.questionId === assignment.essayQuestionId ? {} : {sourceEssayQuestionId: assignment.essayQuestionId})}, {...context, questionMetadata: question});
  }
}

module.exports = {AssignEssayPracticeToStudent};

