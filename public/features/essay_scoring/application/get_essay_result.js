import {normalizeResultReference} from "../domain/essay_result.js?v=20261104-fill-preassessment-v3";

class GetEssayResult {
  constructor(repository) {this.repository = repository;}
  async execute(input) {return this.repository.get(normalizeResultReference(input));}
}

export {GetEssayResult};

