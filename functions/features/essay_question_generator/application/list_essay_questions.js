const {normalizeListInput} = require("../domain/essay_question");


class ListEssayQuestions {
  constructor(repository) {this.repository = repository;}
  async execute(input) {return this.repository.listQuestions(normalizeListInput(input));}
}


module.exports = {ListEssayQuestions};
