import {normalizeEntriesQuery, matchesScope} from "../domain/question_seed_entry.js?v=20261017-seed-association-order-v1";

class GetQuestionSeedEntries {
  constructor(repository) { this.repository = repository; }
  async execute(input) {
    const query = normalizeEntriesQuery(input);
    return (await this.repository.getEntries(query.vertical)).filter(entry => matchesScope(entry, query));
  }
}

export {GetQuestionSeedEntries};
