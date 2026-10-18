import {normalizeEntryInput} from "../domain/question_seed_entry.js?v=20261017-seed-association-order-v1";
import {requireAdministratorUid} from "../domain/question_seed_generator_config.js?v=20261017-seed-association-order-v1";

class SaveQuestionSeedEntry {
  constructor(repository, requireAdministrator) {
    Object.assign(this, {repository, requireAdministrator});
  }

  async execute(input, context) {
    const {vertical, entry} = normalizeEntryInput(input);
    const administrator = await this.requireAdministrator(context);
    requireAdministratorUid(administrator?.uid);
    const saved = await this.repository.saveEntry(vertical, entry, {beforeWrite: administrator.assertAccess});
    administrator.assertAccess?.();
    return saved;
  }
}

export {SaveQuestionSeedEntry};
