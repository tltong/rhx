const {normalizeEntryInput} = require("../domain/question_seed_entry");
const {requireAdministratorUid} = require("../domain/question_seed_generator_config");

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

module.exports = {SaveQuestionSeedEntry};
