class GetTutorConfig {
  constructor(repository) {
    this.repository = repository;
  }

  async execute() {
    return this.repository.get();
  }
}

module.exports = {GetTutorConfig};

