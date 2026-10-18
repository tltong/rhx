import {QUESTION_SEED_VERTICALS} from "../../../config/firebase/question_seed_generator_schema.js?v=20261017-seed-association-order-v1";
import {normalizeScope, pickRandomEntry} from "../domain/question_seed_entry.js?v=20261017-seed-association-order-v1";

class GetCombinedQuestionSeed {
  constructor(repository, random = Math.random) { Object.assign(this, {repository, random}); }
  async execute(input) {
    const scope = normalizeScope(input, {required: true});
    const verticals = Object.values(QUESTION_SEED_VERTICALS);
    const pools = await Promise.all(verticals.map(vertical => this.repository.getEntries(vertical)));
    return verticals.map((vertical, index) => {
      const entry = pickRandomEntry(pools[index], vertical, this.random, scope);
      return vertical[0].toUpperCase() + vertical.slice(1) + ": " + entry;
    }).join("\n");
  }
}

export {GetCombinedQuestionSeed};
