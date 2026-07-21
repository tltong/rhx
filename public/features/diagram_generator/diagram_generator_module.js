import {
  generateLlmText
} from "../../utils/llm/llm_ops.js?v=20260719-diagram-generator";
import {
  GenerateMermaidInstruction
} from "./application/generate_mermaid_instruction.js?v=20260719-diagram-generator";
import {
  GenerateDiagram
} from "./application/generate_diagram.js?v=20260719-diagram-generator";
import {
  RenderMermaidDiagram
} from "./application/render_mermaid_diagram.js?v=20260722-mermaid-chart-repair";
import {
  BrowserMermaidRenderer
} from "./infrastructure/browser_mermaid_renderer.js?v=20260722-mermaid-chart-repair";

const generateMermaidInstruction = new GenerateMermaidInstruction(
  generateLlmText
);
const mermaidRenderer = new BrowserMermaidRenderer();
const generateDiagramUseCase = new GenerateDiagram({
  generateMermaidInstruction,
  mermaidRenderer
});
const renderMermaidDiagramUseCase = new RenderMermaidDiagram({
  generateMermaidInstruction,
  mermaidRenderer
});

async function generateDiagram(description) {
  return generateDiagramUseCase.execute(description);
}

async function renderMermaidDiagram(
  mermaidCode,
  description = "Render this Mermaid diagram without changing its content."
) {
  return renderMermaidDiagramUseCase.execute(mermaidCode, description);
}

export {
  generateDiagram,
  renderMermaidDiagram
};
