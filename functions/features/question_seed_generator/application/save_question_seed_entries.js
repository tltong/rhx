const {normalizeEntriesInput} = require("../domain/question_seed_entry");
const {requireAdministratorUid} = require("../domain/question_seed_generator_config");

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

module.exports = {SaveQuestionSeedEntries};
