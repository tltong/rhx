const {normalizeRemovalInput} = require("../domain/question_seed_entry");
const {requireAdministratorUid} = require("../domain/question_seed_generator_config");

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

module.exports = {RemoveQuestionSeedEntries};
