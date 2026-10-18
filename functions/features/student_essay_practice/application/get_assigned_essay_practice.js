const {normalizeReference} = require("../domain/student_essay_practice");

class GetAssignedEssayPractice {
  constructor(repository) {this.repository = repository;}
  async execute(input) {return this.repository.getAssigned(normalizeReference(input));}
}

module.exports = {GetAssignedEssayPractice};

