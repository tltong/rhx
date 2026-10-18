const {normalizeEntriesQuery, matchesScope} = require("../domain/question_seed_entry");

class GetQuestionSeedEntries {
  constructor(repository) { this.repository = repository; }
  async execute(input) {
    const query = normalizeEntriesQuery(input);
    return (await this.repository.getEntries(query.vertical)).filter(entry => matchesScope(entry, query));
  }
}

module.exports = {GetQuestionSeedEntries};
