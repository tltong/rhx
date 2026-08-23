class DeleteSyllabusScope {
  constructor(syllabusScopeRepository) {
    this.syllabusScopeRepository = syllabusScopeRepository;
  }

  async execute(syllabusScopeId) {
    await this.syllabusScopeRepository.delete(syllabusScopeId);
  }
}

module.exports = {
  DeleteSyllabusScope,
};
