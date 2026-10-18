const {normalizeCompletion} = require("../domain/student_essay_practice");

class CompleteAssignedEssayPractice {
  constructor(repository) {this.repository = repository;}
  async execute(input, context = {}) {
    return this.repository.complete(normalizeCompletion(input), context);
  }
}

module.exports = {CompleteAssignedEssayPractice};

