import {DEFAULT_OCR_SETTINGS, OCR_MODELS_BY_PROVIDER, OCR_DEFAULT_MODELS, getImageOcrConfig, saveImageOcrConfig, testImageOcr} from "../../image_ocr_module.js?v=20261021-ocr-openai-v1";
import {normalizeOcrSettings} from "../../../../utils/llm/image_ocr_settings.js?v=20261021-ocr-openai-v1";
import {mountHandwritingCanvas} from "../../components/handwriting_canvas.js?v=20261021-ocr-crop-pen-v1";
import {getCurrentFirebaseAuthRawUser, onFirebaseAuthStateChanged} from "../../../../utils/firebase/firebase_auth.js";

export function mountImageOcrAdmin({root = document, getConfig = getImageOcrConfig, saveConfig = saveImageOcrConfig,
  testOcr = testImageOcr, mountCanvas = mountHandwritingCanvas,
  createUrl = blob => URL.createObjectURL(blob), revokeUrl = url => URL.revokeObjectURL(url)} = {}) {
  const byId = id => root.getElementById(id), form = byId("ocr-config-form"), save = byId("ocr-save"), retry = byId("ocr-retry-load"), test = byId("ocr-extract");
  const testLanguage = byId("ocr-test-language"), penWidth = byId("ocr-pen-width");
  const names = {provider: "ocr-provider", model: "ocr-model", detail: "ocr-detail", languageHint: "ocr-language", ocrInstructions: "ocr-instructions",
    additionalInstructions: "ocr-additional", maxTokens: "ocr-max-tokens", maxImageSizeMiB: "ocr-max-size", timeoutSeconds: "ocr-timeout"};
  const numberFields = ["maxTokens", "maxImageSizeMiB", "timeoutSeconds"], fields = Object.fromEntries(Object.entries(names).map(([key,id]) => [key, byId(id)]));
  const listeners = [], controller = new AbortController();
  let loaded = false, busy = false, disposed = false, imageUrl = null;
  function listen(element, type, fn) {element.addEventListener(type, fn); listeners.push(() => element.removeEventListener(type, fn));}
  function status(id, message, error = false) {const element = byId(id); element.textContent = message; element.hidden = !message; element.classList.toggle("is-error", error);}
  function errorText(error) {return (error.message || "The OCR request failed.") + (error.requestId ? ` Request ID: ${error.requestId}` : "");}
  function clearResult() {
    byId("ocr-result").hidden = true; byId("ocr-result-text").value = ""; byId("ocr-warnings").replaceChildren();
    byId("ocr-sent-image").removeAttribute("src"); byId("ocr-download").removeAttribute("href");
    if (imageUrl) revokeUrl(imageUrl);
    imageUrl = null;
  }
  const drawing = mountCanvas({canvas: byId("ocr-canvas"), undoButton: byId("ocr-undo"), clearButton: byId("ocr-clear"), penWidth: Number(penWidth.value), onChange(hasInk) {
    if (disposed) return;
    clearResult(); status("ocr-test-status", "");
    byId("ocr-ink-status").textContent = hasInk ? "Your handwriting is ready to test." : "Your paper is blank.";
    controls();
  }});
  function controls() {
    for (const element of [...Object.values(fields), save, testLanguage]) element.disabled = disposed || busy || !loaded;
    retry.disabled = disposed || busy;
    drawing.setEnabled(loaded && !busy && !disposed);
    penWidth.disabled = disposed || busy || !loaded || drawing.isDrawing();
    test.disabled = disposed || busy || !loaded || !drawing.hasInk() || drawing.isDrawing();
    form.setAttribute("aria-busy", String(busy)); byId("ocr-test-panel").setAttribute("aria-busy", String(busy));
  }
  function readForm(overrides = {}) {
    const values = Object.fromEntries(Object.entries(fields).map(([key, element]) => [key, numberFields.includes(key) ? Number(element.value) : element.value]));
    return normalizeOcrSettings({...values, ...overrides});
  }
  function renderModels(provider, selected = OCR_DEFAULT_MODELS[provider]) {
    fields.model.replaceChildren();
    const labels = {"deepseek-flash": "DeepSeek Flash · Vision", "gpt-6.1-sol": "GPT-6.1 Sol", "gpt-6-astra": "GPT-6 Astra"};
    for (const model of OCR_MODELS_BY_PROVIDER[provider] || []) {
      const option = root.createElement("option"); option.value = model; option.textContent = labels[model]; fields.model.append(option);
    }
    fields.model.value = selected;
  }
  function render(input) {
    const settings = normalizeOcrSettings(input || DEFAULT_OCR_SETTINGS);
    renderModels(settings.provider, settings.model);
    for (const [key, field] of Object.entries(fields)) field.value = String(settings[key]);
    byId("ocr-updated-at").textContent = input?.updatedAt ? `Last saved: ${new Date(input.updatedAt).toLocaleString()} by ${input.updatedBy || "administrator"}` : "Initial defaults · Not yet saved";
    byId("ocr-draft-status").textContent = "Current default settings";
  }
  async function load() {
    if (disposed || busy) return;
    busy = true; loaded = false; retry.hidden = true; controls(); status("ocr-config-status", "Loading OCR settings...");
    try {const configuration = await getConfig(); if (!disposed) {render(configuration); loaded = true; status("ocr-config-status", configuration ? "Settings loaded." : "Initial defaults loaded. Save to configure shared OCR settings.");}}
    catch (error) {if (!disposed) {retry.hidden = false; status("ocr-config-status", errorText(error), true);}}
    finally {busy = false; if (!disposed) controls();}
  }
  async function saveSettings(event) {
    event.preventDefault(); if (disposed || busy || !loaded) return;
    let configuration;
    try {configuration = readForm();} catch (error) {status("ocr-config-status", errorText(error), true); return;}
    busy = true; save.textContent = "Saving..."; controls(); status("ocr-config-status", "Saving OCR settings...");
    try {const saved = await saveConfig(configuration); if (!disposed) {render(saved); status("ocr-config-status", "OCR settings saved.");}}
    catch (error) {if (!disposed) status("ocr-config-status", errorText(error), true);}
    finally {busy = false; if (!disposed) {save.textContent = "Save settings"; controls();}}
  }
  async function extract() {
    if (disposed || busy || !loaded || !drawing.hasInk() || drawing.isDrawing()) return;
    let configuration;
    try {
      const languageHint = testLanguage.value.trim();
      configuration = readForm(languageHint ? {languageHint} : {});
    } catch (error) {status("ocr-test-status", errorText(error), true); return;}
    busy = true; clearResult(); test.textContent = "Extracting..."; controls(); status("ocr-test-status", "Converting your handwriting to an image...");
    try {
      const image = await drawing.toBlob();
      if (disposed) return;
      status("ocr-test-status", "Reading your handwriting. This can take a few minutes...");
      const result = await testOcr({image, configuration}, {signal: controller.signal});
      if (disposed) return;
      if (typeof result?.text !== "string" || !Array.isArray(result.warnings) || result.warnings.some(value => typeof value !== "string")) throw new Error("The OCR service returned an invalid transcription.");
      byId("ocr-result-text").value = result.text;
      byId("ocr-result-model").textContent = `${result.provider} · ${result.model}`;
      for (const warning of result.warnings) {const item = root.createElement("li"); item.textContent = warning; byId("ocr-warnings").append(item);}
      byId("ocr-warnings").hidden = !result.warnings.length;
      imageUrl = createUrl(image); byId("ocr-sent-image").src = imageUrl; byId("ocr-download").href = imageUrl;
      byId("ocr-result").hidden = false; status("ocr-test-status", "OCR complete. Review the extracted text and any warnings.");
    } catch (error) {if (!disposed) status("ocr-test-status", errorText(error), true);}
    finally {busy = false; if (!disposed) {test.textContent = "Test OCR"; controls();}}
  }
  for (const field of Object.values(fields)) listen(field, "input", () => {
    if (!disposed && loaded && !busy) byId("ocr-draft-status").textContent = "Unsaved changes · Tests use these settings";
  });
  listen(fields.provider, "change", () => {
    if (disposed || busy || !loaded) return;
    renderModels(fields.provider.value);
    byId("ocr-draft-status").textContent = "Unsaved changes · Tests use these settings";
  });
  listen(penWidth, "change", () => {
    if (!disposed && loaded && !busy && !drawing.isDrawing()) drawing.setPenWidth(Number(penWidth.value));
  });
  listen(form, "submit", saveSettings); listen(retry, "click", load); listen(test, "click", extract);
  render(null); controls();
  return {ready: load(), dispose() {if (disposed) return; disposed = true; controller.abort(); listeners.forEach(remove => remove()); drawing.dispose(); clearResult(); testLanguage.value = ""; controls();}};
}
if (typeof document !== "undefined" && document.getElementById("image-ocr-admin")) {
  const uid = getCurrentFirebaseAuthRawUser()?.uid, page = mountImageOcrAdmin();
  const unsubscribe = onFirebaseAuthStateChanged(user => {
    if (user?.uid === uid) return;
    page.dispose(); const status = document.getElementById("ocr-config-status"); status.hidden = false; status.textContent = "The signed-in account changed. Reload this page to continue.";
  });
  globalThis.addEventListener("pagehide", () => {unsubscribe(); page.dispose();}, {once: true});
}
