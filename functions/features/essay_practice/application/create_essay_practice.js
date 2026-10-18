const {normalizeEssayPractice} = require("../domain/essay_practice");

class CreateEssayPractice {
  constructor({repository, getEssayQuestionById}) {Object.assign(this, {repository, getEssayQuestionById});}
  async execute(input, context = {}) {
    const normalized = normalizeEssayPractice(input);
    context.assertAccess?.();
    const question = await this.getEssayQuestionById(normalized.essayQuestionId);
    context.assertAccess?.();
    if (!question) throw new Error("The essay question could not be found.");
    return this.repository.create(normalized, context);
  }
}

module.exports = {CreateEssayPractice};

