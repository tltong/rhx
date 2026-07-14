export class UpdateSyllabusScope {
  constructor(syllabusScopeRepository) {
    this.syllabusScopeRepository = syllabusScopeRepository;
  }

  async execute(syllabusScope, changes) {
    syllabusScope.update(changes);

    await this.syllabusScopeRepository.save(syllabusScope);

    return syllabusScope;
  }
}
