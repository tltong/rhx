const {normalizeDraftInput} = require("../domain/essay_question");
const {requireAdministratorUid} = require("../domain/essay_question_generator_config");

class SaveEssayQuestion {
  constructor(repository, requireAdministrator) {Object.assign(this, {repository, requireAdministrator});}
  async execute(input, context) {
    const {seedUsed, ...draft} = normalizeDraftInput(input);
    const administrator = await this.requireAdministrator(context);
    requireAdministratorUid(administrator?.uid);
    const saved = await this.repository.saveQuestion({...draft, seed: seedUsed}, {beforeWrite: administrator.assertAccess});
    administrator.assertAccess?.();
    return saved;
  }
}

module.exports = {SaveEssayQuestion};
