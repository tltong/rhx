import {normalizeResultReference} from "../domain/essay_result.js?v=20261018-essay-review-comment-v1";

class GetEssayResult {
  constructor(repository) {this.repository = repository;}
  async execute(input) {return this.repository.get(normalizeResultReference(input));}
}

export {GetEssayResult};

