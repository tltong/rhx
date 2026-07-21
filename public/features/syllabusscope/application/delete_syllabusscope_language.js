export class DeleteSyllabusScopeLanguage {
  constructor(syllabusScopeRepository) {
    this.syllabusScopeRepository = syllabusScopeRepository;
  }

  async execute(syllabusScopeId, language) {
    const syllabusScope = await this.syllabusScopeRepository.getById(
      syllabusScopeId
    );

    if (!syllabusScope) {
      throw new Error("Syllabus scope could not be found.");
    }

    syllabusScope.deleteLanguage(language);
    await this.syllabusScopeRepository.save(syllabusScope);

    return syllabusScope;
  }
}
