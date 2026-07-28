class ListDiagramConfigs {
  constructor(diagramConfigRepository) {
    this.diagramConfigRepository = diagramConfigRepository;
  }

  async execute() {
    return this.diagramConfigRepository.list();
  }
}

module.exports = {
  ListDiagramConfigs,
};
