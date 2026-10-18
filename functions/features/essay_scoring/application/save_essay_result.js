const {normalizeResultInput} = require("../domain/essay_result");

class SaveEssayResult {
  constructor({repository, getEssayQuestionById}) {
    Object.assign(this, {repository, getEssayQuestionById});
  }
  async execute(input, {assertAccess = () => {}, submittedAt} = {}) {
    const result = normalizeResultInput(input);
    assertAccess();
    const question = await this.getEssayQuestionById(result.questionId);
    assertAccess();
    if (!question) throw new Error("The essay question could not be found.");
    return this.repository.save(result, {assertAccess, submittedAt});
  }
}

module.exports = {SaveEssayResult};

