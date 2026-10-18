const {normalizeListInput} = require("../domain/student_essay_practice");

class ListCompletedEssayPractices {
  constructor(repository) {this.repository = repository;}
  async execute(input) {return this.repository.listCompleted(normalizeListInput(input));}
}

module.exports = {ListCompletedEssayPractices};

