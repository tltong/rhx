export class UpdateSyllabus {
  constructor(syllabusRepository) {
    this.syllabusRepository = syllabusRepository;
  }

  async execute(syllabus, changes) {
    syllabus.update(changes);

    await this.syllabusRepository.save(syllabus);

    return syllabus;
  }
}
