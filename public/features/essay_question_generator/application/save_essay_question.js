import {normalizeDraftInput} from "../domain/essay_question.js?v=20261017-essay-grade-min-words-v1";
import {requireAdministratorUid} from "../domain/essay_question_generator_config.js?v=20261017-essay-grade-min-words-v1";

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

export {SaveEssayQuestion};
