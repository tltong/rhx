export class GetReadinessConfig {
  constructor(readinessConfigRepository) {
    this.readinessConfigRepository = readinessConfigRepository;
  }

  async execute() {
    return this.readinessConfigRepository.get();
  }
}
