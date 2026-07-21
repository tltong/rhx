export class GeneratedDiagram {
  constructor({
    description,
    mermaidCode,
    svg,
    diagramType,
    wasRepaired = false
  }) {
    this.description = description;
    this.mermaidCode = mermaidCode;
    this.svg = svg;
    this.diagramType = diagramType;
    this.wasRepaired = wasRepaired;
  }
}
