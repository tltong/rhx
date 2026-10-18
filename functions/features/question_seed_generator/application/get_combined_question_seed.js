const {QUESTION_SEED_VERTICALS} = require("../../../schema/question_seed_generator_schema");
const {normalizeScope, pickRandomEntry} = require("../domain/question_seed_entry");

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

module.exports = {GetCombinedQuestionSeed};
