import {
  generateDiagram
} from "../../diagram_generator_module.js?v=20260722-mermaid-chart-repair";

const descriptionInput = document.querySelector("#diagram-description");
const generateButton = document.querySelector("#generate-diagram");
const statusMessage = document.querySelector("#status-message");
const diagramPreview = document.querySelector("#diagram-preview");
const diagramMeta = document.querySelector("#diagram-meta");
const sourceSection = document.querySelector("#source-section");
const mermaidSource = document.querySelector("#mermaid-source");
const copySourceButton = document.querySelector("#copy-source");
const downloadSvgButton = document.querySelector("#download-svg");

let currentDiagram = null;
let pageBusy = false;

function setStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.hidden = false;
  statusMessage.classList.toggle("error", isError);
}

function clearStatus() {
  statusMessage.textContent = "";
  statusMessage.hidden = true;
  statusMessage.classList.remove("error");
}

function updateGenerateButton() {
  generateButton.disabled = pageBusy || !descriptionInput.value.trim();
}

function setBusy(isBusy) {
  pageBusy = isBusy;
  descriptionInput.disabled = isBusy;
  generateButton.textContent = isBusy
    ? "Generating Diagram..."
    : "Generate Diagram";
  copySourceButton.disabled = isBusy || !mermaidSource.value;
  downloadSvgButton.disabled = isBusy || !currentDiagram?.svg;
  updateGenerateButton();
}

function resetOutput() {
  currentDiagram = null;
  diagramPreview.replaceChildren();

  const emptyState = document.createElement("p");
  emptyState.className = "empty-state";
  emptyState.textContent = "Generating the diagram...";
  diagramPreview.append(emptyState);

  diagramMeta.textContent = "";
  diagramMeta.hidden = true;
  mermaidSource.value = "";
  sourceSection.hidden = true;
  copySourceButton.disabled = true;
  downloadSvgButton.disabled = true;
}

function displayMermaidSource(mermaidCode) {
  if (!mermaidCode) {
    return;
  }

  mermaidSource.value = mermaidCode;
  sourceSection.hidden = false;
  copySourceButton.disabled = false;
}

function displayDiagram(diagram) {
  currentDiagram = diagram;
  diagramPreview.innerHTML = diagram.svg;
  diagramMeta.textContent = [
    `Type: ${diagram.diagramType}`,
    diagram.wasRepaired ? "LLM repair applied" : null
  ].filter(Boolean).join(" | ");
  diagramMeta.hidden = false;
  displayMermaidSource(diagram.mermaidCode);
  downloadSvgButton.disabled = false;
}

async function generateRequestedDiagram() {
  const description = descriptionInput.value.trim();

  if (!description) {
    setStatus("Enter a diagram description first.", true);
    return;
  }

  clearStatus();
  resetOutput();
  setBusy(true);

  try {
    const diagram = await generateDiagram(description);

    displayDiagram(diagram);
    setStatus(
      diagram.wasRepaired
        ? "Diagram generated after repairing the initial Mermaid source."
        : "Diagram generated."
    );
  } catch (error) {
    displayMermaidSource(error?.mermaidCode);
    diagramPreview.replaceChildren();

    const emptyState = document.createElement("p");
    emptyState.className = "empty-state";
    emptyState.textContent = "The diagram could not be rendered.";
    diagramPreview.append(emptyState);
    setStatus(error.message || "Could not generate the diagram.", true);
  } finally {
    setBusy(false);
  }
}

async function copyMermaidSource() {
  if (!mermaidSource.value) {
    return;
  }

  try {
    await navigator.clipboard.writeText(mermaidSource.value);
    setStatus("Mermaid source copied.");
  } catch (error) {
    mermaidSource.focus();
    mermaidSource.select();
    setStatus(
      "Could not copy automatically. The Mermaid source has been selected.",
      true
    );
  }
}

function downloadSvg() {
  if (!currentDiagram?.svg) {
    return;
  }

  const blob = new Blob([currentDiagram.svg], {
    type: "image/svg+xml;charset=utf-8"
  });
  const downloadUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = downloadUrl;
  link.download = "generated-diagram.svg";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(downloadUrl);
}

descriptionInput.addEventListener("input", updateGenerateButton);
generateButton.addEventListener("click", generateRequestedDiagram);
copySourceButton.addEventListener("click", copyMermaidSource);
downloadSvgButton.addEventListener("click", downloadSvg);

updateGenerateButton();
