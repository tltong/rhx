import {normalizeEntriesInput} from "../domain/question_seed_entry.js?v=20261017-seed-association-order-v1";
import {requireAdministratorUid} from "../domain/question_seed_generator_config.js?v=20261017-seed-association-order-v1";

class SaveQuestionSeedEntries {
  constructor(repository, requireAdministrator) {
    this.repository = repository;
    this.requireAdministrator = requireAdministrator;
  }

  async execute(input, context) {
    const normalized = normalizeEntriesInput(input);
    const administrator = await this.requireAdministrator(context);
    requireAdministratorUid(administrator?.uid);
    const saved = await this.repository.saveEntries(normalized, {beforeWrite: administrator.assertAccess});
    administrator.assertAccess?.();
    return saved;
  }
}

export {SaveQuestionSeedEntries};
