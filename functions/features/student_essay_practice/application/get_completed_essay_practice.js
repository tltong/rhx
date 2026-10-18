const {normalizeReference} = require("../domain/student_essay_practice");

class GetCompletedEssayPractice {
  constructor(repository) {this.repository = repository;}
  async execute(input) {return this.repository.getCompleted(normalizeReference(input));}
}

module.exports = {GetCompletedEssayPractice};

