import {normalizeListInput} from "../domain/essay_question.js?v=20261017-essay-grade-min-words-v1";


class ListEssayQuestions {
  constructor(repository) {this.repository = repository;}
  async execute(input) {return this.repository.listQuestions(normalizeListInput(input));}
}


export {ListEssayQuestions};
