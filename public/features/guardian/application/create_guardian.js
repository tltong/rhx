import { Guardian } from "../domain/guardian.js";

export class CreateGuardian {
  constructor(guardianRepository) {
    this.guardianRepository = guardianRepository;
  }

  async execute(data) {
    const guardian = new Guardian(data);

    await this.guardianRepository.save(guardian);

    return guardian;
  }
}
