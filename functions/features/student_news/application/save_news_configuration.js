const {fail, normalizeNewsConfiguration} = require("../domain/news_config");
class SaveNewsConfiguration {
  constructor({repository, requireAdministrator, listLanguages}) {this.repository = repository; this.requireAdministrator = requireAdministrator; this.listLanguages = listLanguages;}
  async execute(input, context) {
    const updatedBy = await this.requireAdministrator(context);
    const configuration = normalizeNewsConfiguration(input);
    if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) throw fail("expectedVersion must be a nonnegative whole number.");
    // Read before committing, so a scope lookup failure cannot look like a failed
    // save after the configuration has already been changed.
    const supportedLanguages = await this.listLanguages();
    const saved = await this.repository.save(configuration, {expectedVersion: input.expectedVersion, updatedBy});
    return {...saved, supportedLanguages};
  }
}
module.exports = {SaveNewsConfiguration};
