class GetEssayScoringConfig {
  constructor(repository) {this.repository = repository;}
  async execute() {return this.repository.getConfig();}
}
export {GetEssayScoringConfig};
