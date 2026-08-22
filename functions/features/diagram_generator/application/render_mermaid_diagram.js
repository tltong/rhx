function requireText(value, fieldName) {
  const text = String(value || "").trim();

  if (!text) {
    throw new Error(`${fieldName} is required.`);
  }

  return text;
}

class RenderMermaidDiagram {
  constructor({ generateMermaidInstruction, mermaidRenderer }) {
    this.generateMermaidInstruction = generateMermaidInstruction;
    this.mermaidRenderer = mermaidRenderer;
  }

  async execute(mermaidCode, description, llmOptions = {}) {
    const initialMermaidCode = requireText(mermaidCode, "Mermaid code");
    const normalizedDescription = requireText(description, "Diagram description");

    try {
      return {
        ...await this.mermaidRenderer.render(initialMermaidCode),
        initialMermaidCode,
        wasRepaired: false,
      };
    } catch (initialError) {
      let repairedMermaidCode = initialMermaidCode;

      try {
        repairedMermaidCode = await this.generateMermaidInstruction.repair({
          description: normalizedDescription,
          mermaidCode: initialMermaidCode,
          errorMessage: initialError.message,
        }, llmOptions);

        return {
          ...await this.mermaidRenderer.render(repairedMermaidCode),
          initialMermaidCode,
          wasRepaired: true,
        };
      } catch (repairError) {
        const error = new Error(
          `Mermaid could not render or repair the diagram: ${repairError.message}`,
        );

        error.cause = repairError;
        error.initialMermaidCode = initialMermaidCode;
        error.mermaidCode = repairedMermaidCode;
        throw error;
      }
    }
  }
}

module.exports = {
  RenderMermaidDiagram,
};
