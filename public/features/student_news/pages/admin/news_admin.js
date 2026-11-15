import {getNewsConfiguration, saveNewsConfiguration} from "../../student_news_module.js?v=20261115-news-student-v1";
import {NEWS_ARTICLE_TYPES, NEWS_LEVELS, NEWS_STANDARDS, NEWS_LIMITS, createDefaultNewsConfiguration, normalizeNewsConfiguration, resolveNewsGradeSettings} from "../../domain/news_config.js?v=20261115-news-student-v1";
import {mountNewsPreview} from "./news_preview.js?v=20261115-news-lookup-progress-v1";

const TITLES = {standardArticle: "Standard article", multiPageArticle: "Multiple-page article", pictureStory: "Picture story"};
export function mountNewsAdmin({root = document, getConfig = getNewsConfiguration, saveConfig = saveNewsConfiguration, previewOptions = {}} = {}) {
  const byId = id => root.getElementById(id), form = byId("news-config-form"), fieldset = byId("news-config-fields"), status = byId("news-status"), saveButton = byId("news-save"), reload = byId("news-reload");
  const languages = byId("news-languages"), discovery = byId("news-discovery-instructions"), common = byId("news-common-instructions");
  const refreshLanguagesButton = byId("news-refresh-languages");
  const defaults = new Map(), types = new Map(), grades = new Map(), listeners = [];
  let canonical = createDefaultNewsConfiguration(), loaded = false, busy = false, saving = false, disposed = false, dirty = false, preview = null;
  function listen(element, event, callback) {element.addEventListener(event, callback); listeners.push(() => element.removeEventListener(event, callback));}
  function field(parent, tag, id, labelText, {type = "text", min, max, options} = {}) {
    const wrapper = root.createElement("div"), label = root.createElement("label"), input = root.createElement(tag);
    input.id = id; label.htmlFor = id; label.textContent = labelText;
    if (tag === "input") input.type = type;
    if (type === "number") {input.min = String(min); input.max = String(max); input.step = "1";}
    if (tag === "textarea") {input.rows = 3; input.maxLength = NEWS_LIMITS.instructions;}
    for (const [value, title] of options || []) {const option = root.createElement("option"); option.value = value; option.textContent = title; input.append(option);}
    wrapper.append(label, input); parent.append(wrapper); return input;
  }
  for (const id of NEWS_ARTICLE_TYPES) {
    const input = field(byId("news-length-defaults"), "input", "news-default-words-" + id, TITLES[id] + " — total words", {type: "number", min: id === "pictureStory" ? 0 : 1, max: NEWS_LIMITS.words});
    input.required = true; defaults.set(id, input);
    const card = root.createElement("div"), title = root.createElement("h3"); card.className = "type-card"; title.textContent = TITLES[id]; card.append(title); byId("news-image-types").append(card);
    const count = field(card, "input", "news-photo-count-" + id, "Number of images", {type: "number", min: id === "pictureStory" ? 1 : 0, max: NEWS_LIMITS.photos}); count.required = true;
    const photoType = field(card, "select", "news-photo-type-" + id, "Image type", {options: [["web", "Web photos (AI fallback)"], ["ai", "AI illustrations"]]});
    types.set(id, {count, photoType});
  }
  const defaultPages = field(byId("news-length-defaults"), "input", "news-default-pages", "Multiple-page article — pages", {type: "number", min: 1, max: NEWS_LIMITS.pages}); defaultPages.required = true;
  for (const level of NEWS_LEVELS) for (const standard of NEWS_STANDARDS) {
    const id = level + "_" + standard, prefix = "news-" + id, card = root.createElement("details"), heading = root.createElement("summary"), summary = root.createElement("span");
    card.className = "grade-card"; heading.textContent = "Grade " + standard; summary.id = prefix + "-summary"; summary.className = "grade-summary"; heading.append(summary); card.append(heading);
    byId("news-" + level + "-grades").append(card);
    const format = field(card, "select", prefix + "-format", "Article format", {options: NEWS_ARTICLE_TYPES.map(id => [id, TITLES[id]])});
    const words = field(card, "input", prefix + "-words", "Target total words (blank uses default)", {type: "number", min: 0, max: NEWS_LIMITS.words});
    const pages = field(card, "input", prefix + "-pages", "Page count (multiple-page articles only)", {type: "number", min: 1, max: NEWS_LIMITS.pages});
    const vocabulary = field(card, "input", prefix + "-vocabulary", "Difficult words or phrases (0 disables highlights)", {type: "number", min: 0, max: NEWS_LIMITS.vocabulary}); vocabulary.required = true;
    const questionMode = field(card, "select", prefix + "-question-mode", "Comprehension answer mode (3 questions)", {options: [["typed", "Type an answer"], ["word_bank", "Shared word bank"]]});
    const instructions = field(card, "textarea", prefix + "-instructions", "Grade LLM instructions");
    grades.set(id, {level, standard, card, format, words, pages, vocabulary, questionMode, instructions, summary});
  }
  function message(value, error = false) {status.textContent = value; status.hidden = !value; status.classList.toggle("is-error", error);}
  function controls() {
    fieldset.disabled = disposed || busy || !loaded; reload.disabled = disposed || busy;
    form.setAttribute("aria-busy", String(busy)); saveButton.textContent = saving ? "Saving..." : "Save settings";
    for (const grade of grades.values()) grade.pages.disabled = grade.format.value !== "multiPageArticle";
    preview?.setConfigurationState({loaded, busy, dirty});
  }
  function number(input, optional = false) {
    if (input.validity?.badInput) throw new Error("Enter a whole number for " + input.previousElementSibling.textContent + ".");
    if (!input.value.trim()) {if (optional) return null; throw new Error("A number is required for " + input.previousElementSibling.textContent + ".");}
    return Number(input.value);
  }
  function readForm() {
    const gradeSettings = {primary: {}, secondary: {}};
    for (const grade of grades.values()) gradeSettings[grade.level][grade.standard] = {level: grade.level, standard: grade.standard, articleTypeId: grade.format.value,
      targetWordCount: number(grade.words, true), pageCount: grade.format.value === "multiPageArticle" ? number(grade.pages, true) : null, vocabularyCount: number(grade.vocabulary), questionAnswerMode: grade.questionMode.value, additionalLlmInstructions: grade.instructions.value};
    return normalizeNewsConfiguration({schemaVersion: 1,
      discoveryInstructions: discovery.value, additionalLlmInstructions: common.value,
      defaultTargetWordCounts: Object.fromEntries([...defaults].map(([id, input]) => [id, number(input)])), defaultMultiPageCount: number(defaultPages),
      articleTypes: Object.fromEntries([...types].map(([id, fields]) => [id, {photoCount: number(fields.count), photoType: fields.photoType.value}])), gradeSettings});
  }
  function summaries() {
    let config;
    try {config = readForm();} catch {return;}
    for (const grade of grades.values()) {
      const settings = resolveNewsGradeSettings(config, grade), type = types.get(settings.articleTypeId);
      grade.words.min = settings.articleTypeId === "pictureStory" ? "0" : "1";
      grade.words.placeholder = String(config.defaultTargetWordCounts[settings.articleTypeId]);
      grade.pages.placeholder = settings.articleTypeId === "multiPageArticle" ? String(config.defaultMultiPageCount) : "Determined by format";
      grade.summary.textContent = TITLES[settings.articleTypeId] + " · " + settings.targetWordCount + " words · " + settings.pageCount + " page" + (settings.pageCount === 1 ? "" : "s") + " · " + settings.photoCount + " image" + (settings.photoCount === 1 ? "" : "s") + (settings.photoCount ? " (" + (type.photoType.value === "web" ? "web, AI fallback" : "AI") + ")" : "") + " · " + config.gradeSettings[grade.level][grade.standard].vocabularyCount + " vocabulary items · 3 questions (" + (grade.questionMode.value === "word_bank" ? "word bank" : "typed") + ")";
    }
  }
  function render(configuration) {
    dirty = false;
    canonical = {...normalizeNewsConfiguration(configuration), version: configuration.version, updatedAt: configuration.updatedAt};
    renderLanguages(configuration.supportedLanguages);
    discovery.value = canonical.discoveryInstructions; common.value = canonical.additionalLlmInstructions;
    for (const [id, input] of defaults) input.value = String(canonical.defaultTargetWordCounts[id]);
    defaultPages.value = String(canonical.defaultMultiPageCount);
    for (const [id, fields] of types) {fields.count.value = String(canonical.articleTypes[id].photoCount); fields.photoType.value = canonical.articleTypes[id].photoType;}
    for (const grade of grades.values()) {
      const value = canonical.gradeSettings[grade.level][grade.standard];
      grade.format.value = value.articleTypeId; grade.words.value = value.targetWordCount === null ? "" : String(value.targetWordCount);
      grade.pages.value = value.pageCount === null ? "" : String(value.pageCount); grade.instructions.value = value.additionalLlmInstructions;
      grade.vocabulary.value = String(value.vocabularyCount);
      grade.questionMode.value = value.questionAnswerMode;
    }
    byId("news-saved-at").textContent = canonical.updatedAt ? "Last saved: " + new Date(canonical.updatedAt).toLocaleString() : "Using defaults — not saved yet";
    summaries();
  }
  function renderLanguages(values) {
    preview?.setLanguages(values);
    if (!Array.isArray(values)) {languages.textContent = "Loading languages from Syllabus Scope..."; return;}
    languages.textContent = values.length ? values.join(", ") : "No languages configured. Add languages in Syllabus Scope.";
  }
  async function refreshLanguages() {
    if (disposed || busy || !loaded) return;
    busy = true; controls(); message("Refreshing languages from Syllabus Scope...");
    try {
      const config = await getConfig(); if (disposed) return;
      // Keep the editor's draft and version: accepting a newer revision here
      // would incorrectly allow a stale configuration draft to overwrite it.
      renderLanguages(config.supportedLanguages); message("Languages refreshed from Syllabus Scope.");
    } catch (error) {if (!disposed) message(error.message || "Could not refresh languages. Try again.", true);}
    finally {busy = false; if (!disposed) controls();}
  }
  async function load() {
    if (disposed || busy) return;
    busy = true; loaded = false; reload.hidden = true; controls(); message("Loading news configuration...");
    try {
      const config = await getConfig(); if (disposed) return;
      render(config); loaded = true; message(config.version === 0 ? "Default settings loaded. Save to apply your configuration." : "Settings loaded.");
    } catch (error) {if (!disposed) {message(error.message || "Could not load settings.", true); reload.textContent = "Retry loading"; reload.hidden = false;}}
    finally {busy = false; if (!disposed) controls();}
  }
  async function save(event) {
    event.preventDefault(); if (disposed || busy || !loaded) return;
    let input;
    try {input = {...readForm(), expectedVersion: canonical.version};}
    catch (error) {message(error.message, true); return;}
    if (!form.reportValidity()) {message("Correct the highlighted settings before saving.", true); return;}
    busy = true; saving = true; controls(); message("Saving news configuration...");
    try {
      const saved = await saveConfig(input); if (disposed) return;
      render(saved); reload.hidden = true; message("Settings saved.");
    } catch (error) {
      if (!disposed) {message(error.message || "Could not save settings. Try again.", true);
        if (error.code?.endsWith("aborted")) {reload.textContent = "Reload saved settings"; reload.hidden = false;}}
    } finally {busy = false; saving = false; if (!disposed) controls();}
  }
  for (const grade of grades.values()) listen(grade.format, "change", () => {
    if (grade.format.value !== "multiPageArticle") grade.pages.value = "";
    grade.words.min = grade.format.value === "pictureStory" ? "0" : "1";
    controls(); summaries();
  });
  listen(form, "input", () => {if (loaded && !busy && !disposed) {dirty = true; summaries(); controls(); message("Unsaved changes.");}});
  listen(form, "change", () => {if (loaded && !busy && !disposed) {dirty = true; summaries(); controls(); message("Unsaved changes.");}});
  listen(form, "submit", save); listen(reload, "click", load);
  listen(refreshLanguagesButton, "click", refreshLanguages);
  render(canonical); controls();
  if (byId("news-preview-panel")) preview = mountNewsPreview({...previewOptions, root});
  return {ready: Promise.all([load(), preview?.ready]), dispose() {disposed = true; listeners.forEach(remove => remove()); preview?.dispose(); controls();}};
}
if (typeof document !== "undefined" && document.getElementById("news-admin")) mountNewsAdmin();
