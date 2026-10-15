class GetRewardConfig {

  constructor(repository) { this.repository = repository; }
  async execute() { return this.repository.getGlobal(); }
}

export {GetRewardConfig};
