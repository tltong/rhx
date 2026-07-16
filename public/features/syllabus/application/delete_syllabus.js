export class DeleteSyllabus {
  constructor(syllabusRepository) {
    this.syllabusRepository = syllabusRepository;
  }

  async execute(syllabusId) {
    await this.syllabusRepository.delete(syllabusId);
  }
}
