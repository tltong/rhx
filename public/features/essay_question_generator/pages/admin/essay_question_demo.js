import {
  ESSAY_QUESTION_LEVELS, ESSAY_QUESTION_STANDARDS, generateEssayQuestion, saveEssayQuestion,
} from "../../essay_question_generator_module.js?v=20261017-essay-grade-min-words-v1";
import {normalizeGenerationInput, normalizeDraftInput} from "../../domain/essay_question.js?v=20261017-essay-grade-min-words-v1";
import {getCombinedQuestionSeed} from "../../../question_seed_generator/question_seed_generator_module.js?v=20261017-seed-association-order-v1";
import {listSyllabusScopeLanguages} from "../../../syllabusscope/syllabusscope_module.js?v=20261014-scope-languages-v1";

export function mountEssayQuestionDemo({
  root = document, generateQuestion = generateEssayQuestion, saveQuestion = saveEssayQuestion,
  getCombinedSeed = getCombinedQuestionSeed, listLanguages = listSyllabusScopeLanguages, onBusyChange = () => {},
} = {}) {
  const byId = id => root.getElementById(id);
  const panel = byId("essay-demo-panel"), form = byId("essay-demo-form"), help = byId("essay-demo-help");
  const level = byId("essay-demo-level"), standard = byId("essay-demo-standard");
  const language = byId("essay-demo-language"), difficulty = byId("essay-demo-difficulty"), seed = byId("essay-demo-seed");
  const languageStatus = byId("essay-demo-language-status"), reload = byId("essay-demo-reload-languages");
  const seedButton = byId("essay-demo-get-seed"), generateButton = byId("essay-demo-generate");
  const progress = byId("essay-demo-progress"), status = byId("essay-demo-status");
  const result = byId("essay-demo-result"), meta = byId("essay-demo-result-meta");
  const preview = byId("essay-demo-preview"), saveButton = byId("essay-demo-save-question");
  const fields = [level, standard, language, difficulty, seed], listeners = [];
  let configuration = {loaded: false, busy: false, dirty: false};
  let action = "", disposed = false, loadingLanguages = false, languagesLoaded = false;
  let draft = null, seedScope = null, saved = false;

  function listen(element, event, callback) {
    element.addEventListener(event, callback);
    listeners.push(() => element.removeEventListener(event, callback));
  }
  function setStatus(element, message, isError = false) {
    element.textContent = message; element.hidden = !message;
    element.classList.toggle("is-error", isError);
  }
  function selectedScope() {
    const grade = Number(standard.value);
    return Object.values(ESSAY_QUESTION_LEVELS).includes(level.value) && ESSAY_QUESTION_STANDARDS.includes(grade)
      ? {level: level.value, grade} : null;
  }
  function generationInput() {
    return normalizeGenerationInput({level: level.value, standard: Number(standard.value),
      language: language.value, difficulty: difficulty.value, seed: seed.value, save: false});
  }
  function updateControls() {
    const unavailable = disposed || Boolean(action) || configuration.busy || !configuration.loaded || loadingLanguages;
    for (const field of fields) field.disabled = unavailable;
    language.disabled = unavailable || loadingLanguages || !languagesLoaded;
    seedButton.disabled = unavailable || !selectedScope();
    let valid = false;
    try {generationInput(); valid = true;} catch {}
    generateButton.disabled = unavailable || configuration.dirty || loadingLanguages || !languagesLoaded || !valid;
    saveButton.disabled = unavailable || !draft;
    reload.disabled = disposed || Boolean(action) || configuration.busy || loadingLanguages;
    progress.hidden = action !== "generating";
    panel.setAttribute("aria-busy", String(Boolean(action)));
    seedButton.textContent = action === "seeding" ? "Getting seed..." : "Get combined seed";
    generateButton.textContent = action === "generating" ? "Generating..." : "Generate question";
    saveButton.textContent = action === "saving" ? "Saving..." : saved ? "Saved" : "Save question";
    help.textContent = configuration.dirty
      ? "Save your changes above before generating a question."
      : "Choose the learner and difficulty, provide a seed, then generate a question using your saved settings.";
  }
  function setAction(value) {
    action = value;
    onBusyChange(Boolean(value));
    updateControls();
  }
  function clearPreview() {
    draft = null; saved = false; preview.value = ""; meta.textContent = ""; result.hidden = true;
  }
  function edited(event) {
    if (disposed || action) return;
    clearPreview();
    let message = "";
    if (event.target === seed) seedScope = null;
    if ((event.target === level || event.target === standard) && seedScope
        && JSON.stringify(seedScope) !== JSON.stringify(selectedScope())) {
      seed.value = ""; seedScope = null;
      message = "Level or grade changed. Get another combined seed or enter a seed.";
    }
    setStatus(status, message); updateControls();
  }
  async function loadLanguages() {
    if (disposed || loadingLanguages || action) return;
    loadingLanguages = true; languagesLoaded = false;
    setStatus(languageStatus, "Loading available languages..."); updateControls();
    try {
      const available = await listLanguages();
      if (disposed) return;
      if (!Array.isArray(available) || available.some(value => typeof value !== "string" || !value.trim())) {
        throw new Error("Could not load valid languages from Syllabus Scope.");
      }
      const previous = language.value, seen = new Set();
      const values = available.map(value => value.trim()).filter(value => {
        const key = value.toLowerCase(); if (seen.has(key)) return false;
        seen.add(key); return true;
      });
      const options = ["", ...values].map(value => {
        const option = root.createElement("option"); option.value = value;
        option.textContent = value || "Choose a language"; return option;
      });
      language.replaceChildren(...options);
      language.value = values.includes(previous) ? previous : "";
      if (previous !== language.value) clearPreview();
      languagesLoaded = values.length > 0;
      setStatus(languageStatus, values.length ? "Languages from Syllabus Scope."
        : "No languages configured. Add languages in Syllabus Scope, then reload them here.");
    } catch (error) {
      if (!disposed) setStatus(languageStatus, error.message || "Could not load languages. Try reloading.", true);
    } finally {loadingLanguages = false; if (!disposed) updateControls();}
  }
  async function getSeed() {
    const scope = selectedScope();
    if (disposed || action || configuration.busy || !configuration.loaded || !scope) return;
    setAction("seeding"); setStatus(status, "Selecting a theme, setting and type for the selected level and grade...");
    try {
      const combined = await getCombinedSeed(scope);
      if (disposed) return;
      if (typeof combined !== "string" || !combined.trim()) throw new Error("The seed generator returned an empty seed.");
      clearPreview(); seed.value = combined.trim(); seedScope = scope;
      setStatus(status, "Combined seed ready. You can edit it before generating a question.");
    } catch (error) {
      if (!disposed) setStatus(status, error.message || "Could not get a combined seed. Try again.", true);
    } finally {if (!disposed) setAction("");}
  }
  async function generate(event) {
    event.preventDefault();
    if (disposed || action || configuration.busy || !configuration.loaded || configuration.dirty || !languagesLoaded || loadingLanguages) return;
    let input;
    try {input = generationInput();}
    catch (error) {setStatus(status, error.message, true); return;}
    setAction("generating"); setStatus(status, "Generating your essay question. This may take a little while...");
    try {
      const generated = normalizeDraftInput(await generateQuestion(input));
      if (disposed) return;
      if (generated.level !== input.level || generated.standard !== input.standard || generated.language !== input.language
          || generated.difficulty !== input.difficulty || generated.seedUsed !== input.seed) {
        throw new Error("The generated question does not match the selected parameters. Try generating again.");
      }
      draft = generated; saved = false;
      preview.value = generated.questionText; result.hidden = false;
      meta.textContent = (generated.level === "primary" ? "Primary" : "Secondary") + " · Grade " + generated.standard
        + " · " + generated.language + " · " + generated.difficulty;
      if (generated.wordCountRequirement.minWords !== null) meta.textContent += " · Minimum " + generated.wordCountRequirement.minWords + " words";
      setStatus(status, "Question generated. Review it, then choose Save question to add it to the question library.");
    } catch (error) {
      if (!disposed) setStatus(status, error.message || "Could not generate a question. Try again.", true);
    } finally {if (!disposed) setAction("");}
  }
  async function save() {
    if (disposed || action || configuration.busy || !configuration.loaded || !draft) return;
    const candidate = {...draft};
    setAction("saving"); setStatus(status, "Saving the generated question...");
    try {
      const question = await saveQuestion(candidate);
      if (disposed) return;
      draft = null; saved = true;
      meta.textContent += " · ID: " + question.questionId;
      setStatus(status, "Question saved.");
    } catch (error) {
      if (!disposed) setStatus(status, error.message || "Could not save the question. Try again.", true);
    } finally {if (!disposed) setAction("");}
  }
  for (const field of fields) listen(field, field === seed ? "input" : "change", edited);
  listen(form, "submit", generate); listen(seedButton, "click", getSeed);
  listen(saveButton, "click", save); listen(reload, "click", loadLanguages);
  clearPreview(); updateControls();
  return {
    ready: loadLanguages(),
    setConfigurationState(value) {configuration = {...value}; updateControls();},
    dispose() {disposed = true; listeners.forEach(remove => remove()); updateControls();},
  };
}
