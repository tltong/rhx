import { GeneratedDiagram } from "../domain/generated_diagram.js";

function requireDescription(value) {
  const description = String(value ?? "").trim();

  if (!description) {
    throw new Error("Diagram description is required.");
  }

  return description;
}

function createDiagram({
  description,
  mermaidCode,
  renderResult,
  wasRepaired
}) {
  return new GeneratedDiagram({
    description,
    mermaidCode,
    svg: renderResult.svg,
    diagramType: renderResult.diagramType,
    wasRepaired
  });
}

function createRenderError(error, initialMermaidCode, mermaidCode) {
  const renderError = new Error(
    `Mermaid could not render the generated diagram: ${error?.message || "Unknown error."}`
  );

  renderError.cause = error;
  renderError.initialMermaidCode = initialMermaidCode;
  renderError.mermaidCode = mermaidCode;

  return renderError;
}

export class GenerateDiagram {
  constructor({ generateMermaidInstruction, mermaidRenderer }) {
    this.generateMermaidInstruction = generateMermaidInstruction;
    this.mermaidRenderer = mermaidRenderer;
  }

  async execute(description) {
    const normalizedDescription = requireDescription(description);
    const initialMermaidCode = await this.generateMermaidInstruction.execute(
      normalizedDescription
    );

    try {
      const renderResult = await this.mermaidRenderer.render(
        initialMermaidCode
      );

      return createDiagram({
        description: normalizedDescription,
        mermaidCode: initialMermaidCode,
        renderResult,
        wasRepaired: false
      });
    } catch (initialRenderError) {
      let repairedMermaidCode = initialMermaidCode;

      try {
        repairedMermaidCode = await this.generateMermaidInstruction.repair({
          description: normalizedDescription,
          mermaidCode: initialMermaidCode,
          errorMessage: initialRenderError?.message
        });
        const renderResult = await this.mermaidRenderer.render(
          repairedMermaidCode
        );

        return createDiagram({
          description: normalizedDescription,
          mermaidCode: repairedMermaidCode,
          renderResult,
          wasRepaired: true
        });
      } catch (repairError) {
        throw createRenderError(
          repairError,
          initialMermaidCode,
          repairedMermaidCode
        );
      }
    }
  }
}
