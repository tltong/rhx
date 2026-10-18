const {normalizeResultReference} = require("../domain/essay_result");

class GetEssayResult {
  constructor(repository) {this.repository = repository;}
  async execute(input) {return this.repository.get(normalizeResultReference(input));}
}

module.exports = {GetEssayResult};

