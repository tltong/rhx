import {
  generateLlmText
} from "../../utils/llm/llm_ops.js?v=20260724-thinking-disabled";
import {
  GenerateMermaidInstruction
} from "./application/generate_mermaid_instruction.js?v=20260723-deepseek-profiles";
import {
  GenerateDiagram
} from "./application/generate_diagram.js?v=20260723-deepseek-profiles";
import {
  RenderMermaidDiagram
} from "./application/render_mermaid_diagram.js?v=20260723-deepseek-profiles";
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

async function generateDiagram(description, llmOptions = {}) {
  return generateDiagramUseCase.execute(description, llmOptions);
}

async function renderMermaidDiagram(
  mermaidCode,
  description = "Render this Mermaid diagram without changing its content.",
  llmOptions = {}
) {
  return renderMermaidDiagramUseCase.execute(
    mermaidCode,
    description,
    llmOptions
  );
}

export {
  generateDiagram,
  renderMermaidDiagram
};
