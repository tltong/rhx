const {
  generateLlmText,
} = require("../../utils/llm/llm_ops");
const {
  GenerateMermaidInstruction,
} = require("./application/generate_mermaid_instruction");
const {
  RenderMermaidDiagram,
} = require("./application/render_mermaid_diagram");
const {
  ServerMermaidRenderer,
} = require("./infrastructure/server_mermaid_renderer");

const renderUseCase = new RenderMermaidDiagram({
  generateMermaidInstruction: new GenerateMermaidInstruction(generateLlmText),
  mermaidRenderer: new ServerMermaidRenderer(),
});

async function renderMermaidDiagram(
  mermaidCode,
  description = "Render this Mermaid diagram without changing its content.",
  llmOptions = {},
) {
  return renderUseCase.execute(mermaidCode, description, llmOptions);
}

module.exports = {
  renderMermaidDiagram,
};
