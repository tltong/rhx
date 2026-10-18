class GetEssayQuestionGeneratorConfig {
  constructor(repository) {this.repository = repository;}
  async execute() {return this.repository.getConfig();}
}


module.exports = {GetEssayQuestionGeneratorConfig};
