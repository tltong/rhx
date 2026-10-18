import {normalizeResultInput} from "../domain/essay_result.js?v=20261018-essay-review-comment-v1";

class SaveEssayResult {
  constructor({repository, getEssayQuestionById}) {
    Object.assign(this, {repository, getEssayQuestionById});
  }
  async execute(input, {assertAccess = () => {}} = {}) {
    const result = normalizeResultInput(input);
    assertAccess();
    const question = await this.getEssayQuestionById(result.questionId);
    assertAccess();
    if (!question) throw new Error("The essay question could not be found.");
    return this.repository.save(result, {assertAccess});
  }
}

export {SaveEssayResult};

