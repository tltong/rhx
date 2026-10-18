import {normalizeEssayPractice} from "../domain/essay_practice.js?v=20261018-preassessment-essay-v1";

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

export {CreateEssayPractice};

