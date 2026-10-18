const {normalizeEntriesQuery, pickRandomEntry} = require("../domain/question_seed_entry");

class GetRandomQuestionSeedEntry {
  constructor(repository, random = Math.random) { Object.assign(this, {repository, random}); }
  async execute(input) {
    const query = normalizeEntriesQuery(input, {required: true});
    return pickRandomEntry(await this.repository.getEntries(query.vertical), query.vertical, this.random, query);
  }
}

module.exports = {GetRandomQuestionSeedEntry};
