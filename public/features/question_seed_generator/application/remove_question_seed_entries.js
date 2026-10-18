import {normalizeRemovalInput} from "../domain/question_seed_entry.js?v=20261017-seed-association-order-v1";
import {requireAdministratorUid} from "../domain/question_seed_generator_config.js?v=20261017-seed-association-order-v1";

class RemoveQuestionSeedEntries {
  constructor(repository, requireAdministrator) {
    Object.assign(this, {repository, requireAdministrator});
  }

  async execute(input, context) {
    const {vertical, entries} = normalizeRemovalInput(input);
    const administrator = await this.requireAdministrator(context);
    requireAdministratorUid(administrator?.uid);
    const remaining = await this.repository.removeEntries(vertical, entries, {beforeWrite: administrator.assertAccess});
    administrator.assertAccess?.();
    return remaining;
  }
}

export {RemoveQuestionSeedEntries};
