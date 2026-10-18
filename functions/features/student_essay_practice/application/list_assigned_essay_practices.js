const {normalizeListInput} = require("../domain/student_essay_practice");

class ListAssignedEssayPractices {
  constructor(repository) {this.repository = repository;}
  async execute(input) {return this.repository.listAssigned(normalizeListInput(input));}
}

module.exports = {ListAssignedEssayPractices};

