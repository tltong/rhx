const {requireId} = require("../domain/essay_practice");

class GetEssayPracticeById {
  constructor(repository) {this.repository = repository;}
  async execute(practiceId) {return this.repository.getById(requireId(practiceId, "practiceId"));}
}

module.exports = {GetEssayPracticeById};

