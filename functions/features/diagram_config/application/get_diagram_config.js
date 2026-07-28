class GetDiagramConfig {
  constructor(diagramConfigRepository) {
    this.diagramConfigRepository = diagramConfigRepository;
  }

  async execute(syllabusId) {
    return this.diagramConfigRepository.getBySyllabusId(syllabusId);
  }
}

module.exports = {
  GetDiagramConfig,
};
