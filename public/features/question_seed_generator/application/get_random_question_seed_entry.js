import {normalizeEntriesQuery, pickRandomEntry} from "../domain/question_seed_entry.js?v=20261017-seed-association-order-v1";

class GetRandomQuestionSeedEntry {
  constructor(repository, random = Math.random) { Object.assign(this, {repository, random}); }
  async execute(input) {
    const query = normalizeEntriesQuery(input, {required: true});
    return pickRandomEntry(await this.repository.getEntries(query.vertical), query.vertical, this.random, query);
  }
}

export {GetRandomQuestionSeedEntry};
