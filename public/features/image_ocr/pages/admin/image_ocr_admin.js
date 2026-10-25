import {DEFAULT_OCR_SETTINGS, OCR_MODELS_BY_PROVIDER, getImageOcrConfig, saveImageOcrConfig, testImageOcr,
  getPendingImageOcrJob, resumeImageOcrJob} from "../../image_ocr_module.js?v=20261025-ocr-jobs-v1";
import {normalizeOcrSettings, normalizeOcrLanguage, ocrLanguageKey, resolveOcrTarget, getSarvamLanguageCode} from "../../../../utils/llm/image_ocr_settings.js?v=20261023-ocr-sarvam-v1";
import {listSyllabusScopeLanguages} from "../../../syllabusscope/syllabusscope_module.js?v=20261014-scope-languages-v1";
import {mountHandwritingCanvas} from "../../components/handwriting_canvas.js?v=20261021-ocr-crop-pen-v1";
import {getCurrentFirebaseAuthRawUser, onFirebaseAuthStateChanged} from "../../../../utils/firebase/firebase_auth.js";
import {describeOcrError} from "./ocr_error_details.js?v=20261025-ocr-jobs-v1";

const providerLabels = {openai: "OpenAI", deepseek: "DeepSeek", paddleocr: "PaddleOCR", sarvam: "Sarvam"};
const modelLabels = {"gpt-6.1-sol": "GPT-6.1 Sol", "gpt-6-astra": "GPT-6 Astra", "deepseek-flash": "DeepSeek Flash", "PP-OCRv6_medium": "PP-OCRv6 medium", "sarvam-vision-v1": "Sarvam Vision"};

export function mountImageOcrAdmin({root = document, getConfig = getImageOcrConfig, saveConfig = saveImageOcrConfig,
  listLanguages = listSyllabusScopeLanguages, testOcr = testImageOcr, mountCanvas = mountHandwritingCanvas,
  getPendingJob = getPendingImageOcrJob, resumeJob = resumeImageOcrJob,
  createUrl = blob => URL.createObjectURL(blob), revokeUrl = url => URL.revokeObjectURL(url), now = () => Date.now(),
  copyText = value => globalThis.navigator?.clipboard?.writeText(value) ?? Promise.reject(new Error("Clipboard is unavailable."))} = {}) {
  const byId = id => root.getElementById(id), form = byId("ocr-config-form"), save = byId("ocr-save"), retry = byId("ocr-retry-load"), test = byId("ocr-extract");
  const testLanguage = byId("ocr-test-language"), penWidth = byId("ocr-pen-width");
  const errorPanel = byId("ocr-error-panel"), copyErrorButton = byId("ocr-error-copy");
  const resume = byId("ocr-resume");
  const names = {provider: "ocr-provider", model: "ocr-model", detail: "ocr-detail", languageHint: "ocr-language", ocrInstructions: "ocr-instructions",
    additionalInstructions: "ocr-additional", maxTokens: "ocr-max-tokens", maxImageSizeMiB: "ocr-max-size", timeoutSeconds: "ocr-timeout"};
  const numberFields = ["maxTokens", "maxImageSizeMiB", "timeoutSeconds"], fields = Object.fromEntries(Object.entries(names).map(([key,id]) => [key, byId(id)]));
  const listeners = [], rowListeners = [], controller = new AbortController(), languageControls = new Map();
  let loaded = false, busy = false, disposed = false, imageUrl = null, languages = [], overrides = {}, errorReport = "", copying = false;
  function listen(element, type, fn, collection = listeners) {element.addEventListener(type, fn); collection.push(() => element.removeEventListener(type, fn));}
  function status(id, message, error = false) {const element = byId(id); element.textContent = message; element.hidden = !message; element.classList.toggle("is-error", error);}
  function errorText(error) {return (error.message || "The OCR request failed.") + (error.requestId ? ` Request ID: ${error.requestId}` : "");}
  function clearError() {
    errorPanel.hidden = true; errorReport = "";
    for (const id of ["ocr-error-summary", "ocr-error-guidance", "ocr-error-details"]) byId(id).textContent = "";
    status("ocr-error-copy-status", "");
  }
  function showError(error, context) {
    let target;
    try {if (context.configuration && context.language) target = resolveOcrTarget({language: context.language}, context.configuration);} catch { /* Invalid settings are reported below. */ }
    const report = describeOcrError(error, {...context, elapsedMs: Math.max(0, now() - context.startedAt),
      provider: providerLabels[target?.provider] || providerLabels[error.provider], model: target?.model || error.model, timeoutSeconds: context.configuration?.timeoutSeconds,
      pageUrl: root.defaultView?.location?.href || globalThis.location?.href,
      online: globalThis.navigator?.onLine});
    byId("ocr-error-summary").textContent = report.summary;
    byId("ocr-error-guidance").textContent = report.guidance;
    byId("ocr-error-details").textContent = report.details;
    errorReport = report.report; status("ocr-error-copy-status", ""); errorPanel.hidden = false;
    errorPanel.scrollIntoView?.({behavior: "smooth", block: "nearest"});
  }
  async function copyError() {
    if (disposed || busy || copying || !errorReport) return;
    const report = errorReport;
    copying = true; controls();
    try {await copyText(report); if (!disposed && errorReport === report) status("ocr-error-copy-status", "Error details copied.");}
    catch {if (!disposed && errorReport === report) status("ocr-error-copy-status", "Clipboard unavailable. Select the error details below and copy them manually.", true);}
    finally {copying = false; if (!disposed) controls();}
  }
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
    const pending = getPendingJob();
    for (const element of [...Object.values(fields), ...languageControls.values(), save, testLanguage]) element.disabled = disposed || busy || !loaded;
    fields.provider.disabled = true;
    retry.disabled = disposed || busy;
    drawing.setEnabled(loaded && !busy && !disposed);
    penWidth.disabled = disposed || busy || !loaded || drawing.isDrawing();
    test.disabled = disposed || busy || !loaded || !!pending || !testLanguage.value || !drawing.hasInk() || drawing.isDrawing();
    resume.hidden = !pending; resume.disabled = disposed || busy;
    copyErrorButton.disabled = disposed || busy || copying || !errorReport;
    form.setAttribute("aria-busy", String(busy)); byId("ocr-test-panel").setAttribute("aria-busy", String(busy));
  }
  function progress({state}) {
    if (disposed) return;
    const messages = {submitting: "Submitting your image once...", queued: "Preparing OCR. Waiting for a worker...",
      processing: "Processing your image. The first request can take longer while OCR starts and loads its models...",
      reconnecting: "Connection interrupted. Checking the same OCR job; your image is not being sent again..."};
    if (messages[state]) status("ocr-test-status", messages[state]);
  }
  function renderResult(result, image) {
    if (typeof result?.text !== "string" || !Array.isArray(result.warnings) || result.warnings.some(value => typeof value !== "string")) throw new Error("The OCR service returned an invalid transcription.");
    byId("ocr-result-text").value = result.text;
    byId("ocr-result-model").textContent = `${providerLabels[result.provider] || result.provider} · ${modelLabels[result.model] || result.model}`;
    for (const warning of result.warnings) {const item = root.createElement("li"); item.textContent = warning; byId("ocr-warnings").append(item);}
    byId("ocr-warnings").hidden = !result.warnings.length;
    byId("ocr-sent-image-details").hidden = !image;
    if (image) {imageUrl = createUrl(image); byId("ocr-sent-image").src = imageUrl; byId("ocr-download").href = imageUrl;}
    byId("ocr-result").hidden = false; status("ocr-test-status", "OCR complete. Review the extracted text and any warnings.");
  }
  async function recover() {
    const pending = getPendingJob();
    if (disposed || busy) return;
    if (!pending) {controls(); status("ocr-test-status", "The previous job is no longer available. You can start a new extraction."); return;}
    const attempt = {operation: "Retrieve previous OCR", phase: "polling", startedAt: now(), language: pending.language};
    clearError(); clearResult(); busy = true; controls(); status("ocr-test-status", "Checking your previous OCR job...");
    try {
      const result = await resumeJob(pending.jobId, {signal: controller.signal, onProgress: progress});
      if (!disposed) renderResult(result);
    } catch (error) {if (!disposed) {status("ocr-test-status", errorText(error) + " See error details below.", true); showError(error, attempt);}}
    finally {busy = false; if (!disposed) controls();}
  }
  function preview() {
    const element = byId("ocr-test-provider");
    if (!testLanguage.value) {element.textContent = "Select a language to see its OCR provider."; return;}
    try {
      const target = resolveOcrTarget({language: testLanguage.value}, {languageProviders: overrides, model: fields.model.value});
      element.textContent = `Will use ${providerLabels[target.provider]} · ${modelLabels[target.model]}`;
    } catch {element.textContent = "Check the OCR settings before testing.";}
  }
  function markDraft() {
    if (disposed || busy || !loaded) return;
    byId("ocr-draft-status").textContent = "Unsaved changes · Tests use these settings";
    clearResult(); preview();
  }
  function readForm() {
    const values = Object.fromEntries(Object.entries(fields).map(([key, element]) => [key, numberFields.includes(key) ? Number(element.value) : element.value]));
    return normalizeOcrSettings({...values, languageProviders: {...overrides}});
  }
  function option(value, label) {const node = root.createElement("option"); node.value = value; node.textContent = label; return node;}
  function renderLanguages() {
    rowListeners.splice(0).forEach(remove => remove()); languageControls.clear();
    const container = byId("ocr-language-providers"); container.replaceChildren();
    languages.forEach((language, index) => {
      const key = ocrLanguageKey(language), row = root.createElement("div"), label = root.createElement("label"), select = root.createElement("select");
      row.className = "language-provider-row"; select.id = `ocr-language-provider-${index}`;
      select.setAttribute("data-language", key); label.setAttribute("for", select.id); label.textContent = language;
      for (const [value, title] of [["", "Default (OpenAI)"], ...Object.entries(providerLabels)]) {
        const choice = option(value, title);
        if (value === "sarvam" && !getSarvamLanguageCode(language)) {choice.disabled = true; choice.textContent = "Sarvam (language not supported)";}
        select.append(choice);
      }
      select.value = overrides[key] || "";
      listen(select, "change", () => {
        if (disposed || busy || !loaded) return;
        if (select.value) overrides[key] = select.value; else delete overrides[key];
        markDraft();
      }, rowListeners);
      row.append(label); row.append(select); container.append(row); languageControls.set(key, select);
    });
    byId("ocr-no-languages").hidden = languages.length > 0;
    const selected = testLanguage.value;
    testLanguage.replaceChildren(); testLanguage.append(option("", "Select a language"));
    for (const language of languages) testLanguage.append(option(language, language));
    testLanguage.value = languages.includes(selected) ? selected : "";
    preview();
  }
  function render(input) {
    const settings = normalizeOcrSettings(input || DEFAULT_OCR_SETTINGS);
    overrides = {...settings.languageProviders};
    fields.model.replaceChildren();
    for (const model of OCR_MODELS_BY_PROVIDER.openai) fields.model.append(option(model, modelLabels[model]));
    for (const [key, field] of Object.entries(fields)) field.value = String(settings[key]);
    renderLanguages();
    byId("ocr-updated-at").textContent = input?.updatedAt ? `Last saved: ${new Date(input.updatedAt).toLocaleString()} by ${input.updatedBy || "administrator"}` : "Initial defaults · Not yet saved";
    byId("ocr-draft-status").textContent = "Current default settings";
  }
  async function load() {
    if (disposed || busy) return;
    const attempt = {operation: "Load OCR settings", phase: "configuration", startedAt: now()};
    clearError();
    busy = true; loaded = false; retry.hidden = true; controls(); status("ocr-config-status", "Loading OCR settings and syllabus languages...");
    try {
      const [configuration, available] = await Promise.all([getConfig(), listLanguages()]);
      if (!Array.isArray(available)) throw new Error("Syllabus languages could not be loaded.");
      const unique = new Map();
      for (const value of available) {const language = normalizeOcrLanguage(value); unique.set(ocrLanguageKey(language), language);}
      if (!disposed) {
        languages = [...unique.values()].sort((a,b) => a.localeCompare(b));
        render(configuration); loaded = true;
        status("ocr-config-status", configuration ? "Settings loaded." : "OpenAI defaults loaded. Save to configure providers by language.");
        if (getPendingJob()) status("ocr-test-status", "A previous OCR job is available. Choose Check previous OCR to retrieve its result without sending the image again.");
      }
    } catch (error) {if (!disposed) {retry.hidden = false; status("ocr-config-status", errorText(error), true); showError(error, attempt);}}
    finally {busy = false; if (!disposed) controls();}
  }
  async function saveSettings(event) {
    event.preventDefault(); if (disposed || busy || !loaded) return;
    const attempt = {operation: "Save OCR settings", phase: "validation", startedAt: now()};
    clearError();
    let configuration;
    try {configuration = readForm();} catch (error) {status("ocr-config-status", errorText(error), true); showError(error, attempt); controls(); return;}
    Object.assign(attempt, {phase: "save", configuration, language: testLanguage.value});
    busy = true; save.textContent = "Saving..."; controls(); status("ocr-config-status", "Saving OCR settings...");
    try {const saved = await saveConfig(configuration); if (!disposed) {render(saved); status("ocr-config-status", "OCR settings saved.");}}
    catch (error) {if (!disposed) {status("ocr-config-status", errorText(error), true); showError(error, attempt);}}
    finally {busy = false; if (!disposed) {save.textContent = "Save settings"; controls();}}
  }
  async function extract() {
    if (disposed || busy || !loaded || getPendingJob() || !drawing.hasInk() || drawing.isDrawing()) return;
    const attempt = {operation: "Test OCR", phase: "validation", startedAt: now()};
    clearError();
    let configuration, language;
    try {language = normalizeOcrLanguage(testLanguage.value); configuration = readForm();}
    catch (error) {status("ocr-test-status", errorText(error), true); showError(error, attempt); controls(); return;}
    Object.assign(attempt, {configuration, language, phase: "image"});
    busy = true; clearResult(); test.textContent = "Extracting..."; controls(); status("ocr-test-status", "Converting your handwriting to an image...");
    try {
      const image = await drawing.toBlob();
      if (disposed) return;
      attempt.phase = "request";
      status("ocr-test-status", "Reading your handwriting. This can take a few minutes...");
      const result = await testOcr({image, language, configuration}, {signal: controller.signal, onProgress: progress});
      if (disposed) return;
      attempt.phase = "result";
      renderResult(result, image);
    } catch (error) {if (!disposed) {status("ocr-test-status", errorText(error) + " See error details below.", true); showError(error, attempt);}}
    finally {busy = false; if (!disposed) {test.textContent = "Test OCR"; controls();}}
  }
  for (const field of Object.values(fields)) listen(field, "input", markDraft);
  listen(testLanguage, "change", () => {if (!disposed && !busy) {clearResult(); preview(); controls();}});
  listen(penWidth, "change", () => {if (!disposed && loaded && !busy && !drawing.isDrawing()) drawing.setPenWidth(Number(penWidth.value));});
  listen(form, "submit", saveSettings); listen(retry, "click", load); listen(test, "click", extract);
  listen(copyErrorButton, "click", copyError);
  listen(resume, "click", recover);
  clearError(); render(null); controls();
  return {ready: load(), dispose() {
    if (disposed) return; disposed = true; controller.abort(); listeners.forEach(remove => remove()); rowListeners.forEach(remove => remove());
    drawing.dispose(); clearResult(); clearError(); testLanguage.value = ""; controls();
  }};
}
if (typeof document !== "undefined" && document.getElementById("image-ocr-admin")) {
  const uid = getCurrentFirebaseAuthRawUser()?.uid, page = mountImageOcrAdmin();
  const unsubscribe = onFirebaseAuthStateChanged(user => {
    if (user?.uid === uid) return;
    page.dispose(); const status = document.getElementById("ocr-config-status"); status.hidden = false; status.textContent = "The signed-in account changed. Reload this page to continue.";
  });
  globalThis.addEventListener("pagehide", () => {unsubscribe(); page.dispose();}, {once: true});
}
