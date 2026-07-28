class ListSyllabuses {
  constructor(syllabusRepository) {
    this.syllabusRepository = syllabusRepository;
  }

  async execute() {
    return this.syllabusRepository.list();
  }
}

module.exports = {
  ListSyllabuses,
};
