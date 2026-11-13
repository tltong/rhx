import {ESSAY_IMAGE_PROMPT_INSTRUCTIONS} from "../../config/essay_question_prompt_template.js?v=20261112-essay-variation-v1";
import {renderEssayQuestionSupport} from "../../components/essay_question_support_view.js?v=20261113-essay-helping-preview-v1";
import {
  ESSAY_QUESTION_LEVELS, ESSAY_QUESTION_STANDARDS, generateEssayQuestion, saveEssayQuestion,
} from "../../essay_question_generator_module.js?v=20261112-essay-variation-v1";
import {normalizeGenerationInput, normalizeDraftInput} from "../../domain/essay_question.js?v=20261112-essay-variation-v1";
import {getCombinedQuestionSeed} from "../../../question_seed_generator/question_seed_generator_module.js?v=20261104-fill-preassessment-v3";
import {listSyllabusScopeLanguages} from "../../../syllabusscope/syllabusscope_module.js?v=20261104-fill-preassessment-v3";

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
  const essayType = byId("essay-demo-type");
  const fields = [level, standard, language, difficulty, seed, ...(essayType ? [essayType] : [])], listeners = [];
  let configuration = {loaded: false, busy: false, dirty: false};
  let action = "", disposed = false, loadingLanguages = false, languagesLoaded = false;
  let disposeSupport = () => {};
  let draft = null, seedScope = null, saved = false;

  function listen(element, event, callback) {
    element.addEventListener(event, callback);
    listeners.push(() => element.removeEventListener(event, callback));
  }
  function setStatus(element, message, isError = false) {
    element.textContent = message; element.hidden = !message;
    element.classList.toggle("is-error", isError);
  }
  let typeOptionsKey = "";
  function refreshTypes() {
    const config = configuration.config;
    const refs = config.gradeSettings?.[level.value]?.[standard.value]?.essayTypes ?? [];
    const key = JSON.stringify([level.value, standard.value, refs, config.essayTypes.map(type => [type.id, type.name])]);
    if (key === typeOptionsKey) return;
    typeOptionsKey = key; const previous = essayType.value; essayType.replaceChildren();
    const prompt = root.createElement("option"); prompt.value = ""; prompt.textContent = refs.length ? "Choose an essay type" : "No essay types available for this grade"; essayType.append(prompt);
    for (const ref of refs) {
      const type = config.essayTypes.find(item => item.id === ref.essayTypeId); if (!type) continue;
      const option = root.createElement("option"); option.value = type.id; option.textContent = type.name; essayType.append(option);
    }
    essayType.value = refs.some(ref => ref.essayTypeId === previous) ? previous : refs.length === 1 ? refs[0].essayTypeId : "";
  }
  function selectedScope() {
    const grade = Number(standard.value);
    return Object.values(ESSAY_QUESTION_LEVELS).includes(level.value) && ESSAY_QUESTION_STANDARDS.includes(grade)
      ? {level: level.value, grade} : null;
  }
  function generationInput() {
    return normalizeGenerationInput({level: level.value, standard: Number(standard.value),
      language: language.value, difficulty: difficulty.value, seed: seed.value, save: false, ...(essayType?.value ? {essayTypeId: essayType.value} : {})});
  }
  function updateControls() {
    const unavailable = disposed || Boolean(action) || configuration.busy || !configuration.loaded || loadingLanguages;
    for (const field of fields) field.disabled = unavailable;
    language.disabled = unavailable || loadingLanguages || !languagesLoaded;
    seedButton.disabled = unavailable || !selectedScope();
    if (essayType && configuration.config) refreshTypes();
    let valid = false;
    try {generationInput(); valid = !essayType || Boolean(essayType.value);} catch {}
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
    clearSupportPreview();
    draft = null; saved = false; preview.value = ""; meta.textContent = ""; result.hidden = true;
  }
  function clearSupportPreview() {
    disposeSupport(); disposeSupport = () => {};
    const container = byId("essay-demo-support");
    container?.replaceChildren();
    if (container?.dataset) delete container.dataset.supportKey;
    const heading = byId("essay-demo-picture-heading"), pictureStatus = byId("essay-demo-picture-status");
    if (heading) heading.hidden = true;
    if (pictureStatus) setStatus(pictureStatus, "");
    const helpingStatus = byId("essay-demo-helping-status");
    if (helpingStatus) setStatus(helpingStatus, "");
    const helpingSection = byId("essay-demo-helping"), helpingHeading = byId("essay-demo-helping-heading");
    if (helpingSection) helpingSection.hidden = true;
    if (helpingHeading) helpingHeading.textContent = "Helping suggestions";
    const suggestions = byId("essay-demo-helping-suggestions");
    if (suggestions) {suggestions.replaceChildren(); suggestions.hidden = true;}
    const details = byId("essay-demo-image-prompts");
    if (details) details.hidden = true;
    for (const id of ["essay-demo-image-prompt-instructions", "essay-demo-image-prompt"]) {
      const field = byId(id); if (field) {field.value = ""; field.placeholder = "";}
    }
    const note = byId("essay-demo-image-prompts-note"); if (note) note.textContent = "";
  }
  function renderImagePromptDetails(question) {
    const details = byId("essay-demo-image-prompts");
    if (!details) return;
    const requested = Boolean(question.support?.settings.pictureEnabled || question.imagePrompt);
    const disabled = question.support?.settings.pictureEnabled === false;
    const instructions = byId("essay-demo-image-prompt-instructions"), output = byId("essay-demo-image-prompt");
    if (instructions) {
      instructions.value = requested ? ESSAY_IMAGE_PROMPT_INSTRUCTIONS : "";
      instructions.placeholder = disabled ? "Not requested: pictures are disabled." : "Instructions are unavailable for this question.";
    }
    if (output) {
      output.value = question.imagePrompt || "";
      output.placeholder = requested ? "The LLM did not return an image-generation prompt." : "No image-generation prompt was requested.";
    }
    const note = byId("essay-demo-image-prompts-note");
    if (note) note.textContent = requested
      ? "The essay question and image prompt are generated together in one LLM request. The first field shows the image-specific instructions from that request; the second shows the returned prompt."
      : disabled ? "Pictures are disabled for this level and standard, so no image-generation prompt was requested."
        : "Image-prompt details are unavailable for this question.";
    details.hidden = false;
  }
  function renderSupportPreview(question) {
    clearSupportPreview();
    renderImagePromptDetails(question);
    const support = question.support;
    const heading = byId("essay-demo-picture-heading"), pictureStatus = byId("essay-demo-picture-status");
    if (heading) heading.hidden = support?.pictureStatus !== "ready";
    if (pictureStatus) {
      const message = support?.pictureStatus === "failed"
        ? "A picture was requested but could not be generated. The text question is ready."
        : support?.pictureStatus === "disabled"
          ? "Pictures are disabled for this level and standard. Enable pictures in the grade settings above and save before generating."
          : "";
      setStatus(pictureStatus, message);
    }
    const helpingStatus = byId("essay-demo-helping-status");
    const helpingSection = byId("essay-demo-helping"), helpingHeading = byId("essay-demo-helping-heading");
    const suggestions = byId("essay-demo-helping-suggestions");
    const words = support?.helpingWordsStatus === "ready" ? support.helpingWords : [];
    if (helpingSection) helpingSection.hidden = false;
    if (helpingHeading && words.length) helpingHeading.textContent = "Helping suggestions (" + words.length + ")";
    if (suggestions) {
      for (const word of words) {
        const item = root.createElement("li"); item.textContent = word; item.dir = "auto"; suggestions.append(item);
      }
      suggestions.hidden = !words.length;
    }
    if (helpingStatus) {
      const message = support?.helpingWordsStatus === "failed"
        ? "Helping suggestions were requested but could not be generated. The question is ready to use."
        : support?.helpingWordsStatus === "disabled"
          ? "Helping suggestions are disabled for this level and standard. Enable helping suggestions in the grade settings above and save before generating."
          : words.length ? "" : "No helping suggestions were returned for this question.";
      setStatus(helpingStatus, message);
    }
    disposeSupport = renderEssayQuestionSupport({root, container: byId("essay-demo-support"), question,
      showHelpingWords: false});
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
      if (essayType && !essayType.value) throw new Error("Choose an available essay type.");
      const generated = normalizeDraftInput(await generateQuestion(input));
      if (disposed) return;
      if (generated.level !== input.level || generated.standard !== input.standard || generated.language !== input.language
          || (input.essayTypeId && generated.essayTypeId !== input.essayTypeId) || generated.difficulty !== input.difficulty || generated.seedUsed !== input.seed) {
        throw new Error("The generated question does not match the selected parameters. Try generating again.");
      }
      draft = generated; saved = false;
      renderSupportPreview(generated);
      preview.value = generated.questionText; result.hidden = false;
      meta.textContent = (generated.level === "primary" ? "Primary" : "Secondary") + " · Grade " + generated.standard
        + " · " + generated.language + " · " + generated.difficulty;
      if (generated.essayType) meta.textContent += " · " + generated.essayType.name;
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
    dispose() {disposeSupport(); disposed = true; listeners.forEach(remove => remove()); updateControls();},
  };
}
