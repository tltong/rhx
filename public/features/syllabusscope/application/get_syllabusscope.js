export class GetSyllabusScope {
  constructor(syllabusScopeRepository) {
    this.syllabusScopeRepository = syllabusScopeRepository;
  }

  async execute(syllabusScopeId) {
    return this.syllabusScopeRepository.getById(syllabusScopeId);
  }
}
