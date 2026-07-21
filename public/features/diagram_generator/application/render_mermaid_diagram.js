function requireText(value, fieldName) {
  const normalizedValue = String(value ?? "").trim();

  if (!normalizedValue) {
    throw new Error(`${fieldName} is required.`);
  }

  return normalizedValue;
}

function createRenderError(error, initialMermaidCode, repairedMermaidCode) {
  const renderError = new Error(
    `Mermaid could not render or repair the diagram: ${error?.message || "Unknown error."}`
  );

  renderError.cause = error;
  renderError.initialMermaidCode = initialMermaidCode;
  renderError.mermaidCode = repairedMermaidCode;

  return renderError;
}

export class RenderMermaidDiagram {
  constructor({ generateMermaidInstruction, mermaidRenderer }) {
    this.generateMermaidInstruction = generateMermaidInstruction;
    this.mermaidRenderer = mermaidRenderer;
  }

  async execute(mermaidCode, description) {
    const normalizedMermaidCode = requireText(
      mermaidCode,
      "Mermaid code"
    );
    const normalizedDescription = requireText(
      description,
      "Diagram description"
    );

    try {
      const renderResult = await this.mermaidRenderer.render(
        normalizedMermaidCode
      );

      return {
        ...renderResult,
        initialMermaidCode: normalizedMermaidCode,
        wasRepaired: false
      };
    } catch (initialRenderError) {
      let repairedMermaidCode = normalizedMermaidCode;

      try {
        repairedMermaidCode = await this.generateMermaidInstruction.repair({
          description: normalizedDescription,
          mermaidCode: normalizedMermaidCode,
          errorMessage: initialRenderError?.message
        });
        const renderResult = await this.mermaidRenderer.render(
          repairedMermaidCode
        );

        return {
          ...renderResult,
          initialMermaidCode: normalizedMermaidCode,
          wasRepaired: true
        };
      } catch (repairError) {
        throw createRenderError(
          repairError,
          normalizedMermaidCode,
          repairedMermaidCode
        );
      }
    }
  }
}
