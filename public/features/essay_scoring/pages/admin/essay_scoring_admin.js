import {ESSAY_SCORING_LEVELS, ESSAY_SCORING_GRADES, createDefaultConfiguration, getEssayScoringConfig,
  saveEssayScoringConfig} from "../../essay_scoring_module.js?v=20261020-scoring-config-v1";
import {EssayScoringConfig, normalizeConfiguration} from "../../domain/essay_scoring_config.js?v=20261020-scoring-config-v1";
import {buildEssayScoringInstructions} from "../../application/build_essay_scoring_prompt.js?v=20261020-scoring-config-v1";

export function mountEssayScoringAdmin({root = document, getConfig = getEssayScoringConfig, saveConfig = saveEssayScoringConfig} = {}) {
  const byId = id => root.getElementById(id);
  const form = byId("scoring-config-form"), base = byId("scoring-base-instructions"), additional = byId("scoring-additional-instructions");
  const status = byId("scoring-status"), updatedAt = byId("scoring-updated-at"), saveButton = byId("scoring-save-config");
  const retry = byId("scoring-retry-load"), preview = byId("scoring-preview"), previewStatus = byId("scoring-preview-status");
  const levelSelect = byId("scoring-preview-level"), gradeSelect = byId("scoring-preview-grade");
  const grades = new Map(), listeners = [];
  let busy = false, loaded = false, disposed = false, dirty = false;
  function listen(element, event, handler) {
    element.addEventListener(event, handler);
    listeners.push(() => element.removeEventListener(event, handler));
  }
  function setStatus(message, isError = false) {
    status.textContent = message; status.hidden = !message; status.classList.toggle("is-error", isError);
  }
  for (const level of ESSAY_SCORING_LEVELS) {
    const fields = new Map();
    for (const grade of ESSAY_SCORING_GRADES) {
      const field = root.createElement("div"), label = root.createElement("label"), input = root.createElement("textarea");
      input.id = "scoring-" + level + "-grade-" + grade; input.rows = 3; input.disabled = true; input.dir = "auto";
      label.setAttribute("for", input.id); label.textContent = "Grade " + grade;
      field.append(label, input); byId("scoring-" + level + "-instructions").append(field); fields.set(grade, input);
    }
    grades.set(level, fields);
  }
  const inputs = [base, additional, ...[...grades.values()].flatMap(fields => [...fields.values()])];
  function updateControls() {
    const disabled = disposed || busy || !loaded;
    for (const input of [...inputs, levelSelect, gradeSelect]) input.disabled = disabled;
    saveButton.disabled = disabled; retry.disabled = disposed || busy;
    form.setAttribute("aria-busy", String(busy));
  }
  function readForm() {
    return normalizeConfiguration({markingInstructions: base.value, additionalLlmInstructions: additional.value,
      gradeInstructions: Object.fromEntries([...grades].map(([level, fields]) =>
        [level, Object.fromEntries([...fields].map(([grade, input]) => [grade, input.value]))]))});
  }
  function updatePreview() {
    if (disposed || !loaded) return;
    try {
      preview.value = buildEssayScoringInstructions({level: levelSelect.value, grade: Number(gradeSelect.value)}, readForm());
      previewStatus.textContent = dirty ? "Preview includes unsaved changes." : "Preview matches the loaded settings.";
      previewStatus.classList.toggle("is-error", false);
    } catch (error) {
      preview.value = ""; previewStatus.textContent = error.message || "Check the instructions to preview them.";
      previewStatus.classList.toggle("is-error", true);
    }
  }
  function render(configuration) {
    const config = configuration ? new EssayScoringConfig({...configuration}) : createDefaultConfiguration();
    base.value = config.markingInstructions; additional.value = config.additionalLlmInstructions;
    for (const [level, fields] of grades) for (const [grade, input] of fields) input.value = config.gradeInstructions[level][grade];
    updatedAt.textContent = configuration ? "Last saved: " + config.updatedAt.toLocaleString() + " by " + config.updatedBy : "Default rubric · Not yet saved";
    dirty = false;
  }
  async function load() {
    if (disposed || busy) return;
    busy = true; loaded = false; preview.value = ""; previewStatus.textContent = ""; retry.hidden = true;
    setStatus("Loading essay marking settings..."); updateControls();
    try {
      const config = await getConfig();
      if (disposed) return;
      render(config); loaded = true; updatePreview();
      setStatus(config ? "Settings loaded." : "Default marking instructions loaded. Save settings to configure your rubric.");
    } catch (error) {
      if (!disposed) {retry.hidden = false; setStatus(error.message || "Could not load settings.", true);}
    } finally {busy = false; if (!disposed) updateControls();}
  }
  async function save(event) {
    event.preventDefault();
    if (disposed || busy || !loaded) return;
    let configuration;
    try {configuration = readForm();}
    catch (error) {setStatus(error.message || "Check your settings.", true); updatePreview(); return;}
    busy = true; saveButton.textContent = "Saving..."; setStatus("Saving settings..."); updateControls();
    try {
      const config = await saveConfig(configuration);
      if (disposed) return;
      render(config); updatePreview(); setStatus("Settings saved. Future marking will use these instructions.");
    } catch (error) {
      if (!disposed) setStatus(error.message || "Could not save settings. Your edits are retained.", true);
    } finally {busy = false; if (!disposed) {saveButton.textContent = "Save settings"; updateControls();}}
  }
  for (const input of inputs) listen(input, "input", () => {
    if (disposed || !loaded || busy) return;
    dirty = true; setStatus("You have unsaved changes."); updatePreview();
  });
  for (const select of [levelSelect, gradeSelect]) listen(select, "change", updatePreview);
  listen(form, "submit", save); listen(retry, "click", load);
  render(null); updateControls();
  return {ready: load(), dispose() {disposed = true; listeners.forEach(remove => remove()); updateControls();}};
}

if (typeof document !== "undefined" && document.getElementById("essay-scoring-admin")) mountEssayScoringAdmin();
