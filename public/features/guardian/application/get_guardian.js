export class GetGuardian {
  constructor(guardianRepository) {
    this.guardianRepository = guardianRepository;
  }

  async execute(guardianId) {
    return this.guardianRepository.getById(guardianId);
  }
}
