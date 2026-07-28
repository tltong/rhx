class GetSyllabus {
  constructor(syllabusRepository) {
    this.syllabusRepository = syllabusRepository;
  }

  async execute(syllabusId) {
    return this.syllabusRepository.getById(syllabusId);
  }
}

module.exports = {
  GetSyllabus,
};
