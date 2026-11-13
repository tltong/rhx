import {normalizeListInput} from "../domain/essay_question.js?v=20261112-essay-variation-v1";


class ListEssayQuestions {
  constructor(repository) {this.repository = repository;}
  async execute(input) {return this.repository.listQuestions(normalizeListInput(input));}
}


export {ListEssayQuestions};
