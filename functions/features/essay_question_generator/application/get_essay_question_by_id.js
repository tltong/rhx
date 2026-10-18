const {normalizeQuestionId} = require("../domain/essay_question");


class GetEssayQuestionById {
  constructor(repository) {this.repository = repository;}
  async execute(questionId) {return this.repository.getQuestionById(normalizeQuestionId(questionId));}
}


module.exports = {GetEssayQuestionById};
