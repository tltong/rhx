export class AddSyllabusLanguage {
  constructor(syllabusRepository) {
    this.syllabusRepository = syllabusRepository;
  }

  async execute(syllabusId, language) {
    const syllabus = await this.syllabusRepository.getById(syllabusId);

    if (!syllabus) {
      throw new Error("Syllabus could not be found.");
    }

    syllabus.addLanguage(language);
    await this.syllabusRepository.save(syllabus);

    return syllabus;
  }
}
