import {
  DEFAULT_QUESTION_GENERATION_SEED, QUESTION_SEED_VERTICALS,
  getQuestionSeedGeneratorConfig, saveQuestionSeedGeneratorConfig,
  getQuestionSeedEntries, generateQuestionSeedEntry, saveQuestionSeedEntry, removeQuestionSeedEntries, getCombinedQuestionSeed,
} from "../../question_seed_generator_module.js?v=20261017-seed-association-order-v1";
import {
  normalizeEntries, normalizeEntry, normalizeAssociations, normalizeScope, matchesScope, entryKey,
} from "../../domain/question_seed_entry.js?v=20261017-seed-association-order-v1";
import {createAssociationPicker} from "./association_picker.js?v=20261017-seed-association-order-v1";

export function mountQuestionSeedGeneratorAdmin({
  root = document,
  getConfig = getQuestionSeedGeneratorConfig, saveConfig = saveQuestionSeedGeneratorConfig,
  getEntries = getQuestionSeedEntries, generateEntry = generateQuestionSeedEntry,
  saveEntry = saveQuestionSeedEntry, removeEntries = removeQuestionSeedEntries, getCombinedSeed = getCombinedQuestionSeed,
} = {}) {
  const byId = id => root.getElementById(id);
  const form = byId("seed-config-form");
  const status = byId("seed-page-status");
  const configStatus = byId("seed-config-status");
  const retryButton = byId("seed-retry-load");
  const seedInput = byId("seed-generation-seed");
  const instructions = byId("seed-llm-instructions");
  const updatedAt = byId("seed-updated-at");
  const saveConfigButton = byId("seed-save-config");
  const combinedButton = byId("seed-get-combined");
  const combinedOutput = byId("seed-combined-output");
  const combinedStatus = byId("seed-combined-status");
  const combinedAvailability = byId("seed-combined-availability");
  const levelInput = byId("seed-combined-level");
  const gradeInput = byId("seed-combined-grade");
  const cards = Object.values(QUESTION_SEED_VERTICALS).map(vertical => ({
    vertical, entries: [], busy: false, removing: false,
    selected: new Set(), rows: [], associationDrafts: new Map(),
    panel: byId("seed-" + vertical + "-card"),
    useSeed: byId("seed-" + vertical + "-use-seed"),
    override: byId("seed-" + vertical + "-override"),
    preview: byId("seed-" + vertical + "-preview"),
    associationSection: byId("seed-" + vertical + "-association-section"),
    generate: byId("seed-" + vertical + "-generate"),
    save: byId("seed-" + vertical + "-save"),
    remove: byId("seed-" + vertical + "-remove"),
    status: byId("seed-" + vertical + "-status"),
    count: byId("seed-" + vertical + "-count"),
    empty: byId("seed-" + vertical + "-empty"),
    list: byId("seed-" + vertical + "-entries"),
  }));
  let loaded = false, loading = false, savingConfig = false, combining = false, disposed = false;
  let selectionRevision = 0;
  const listeners = [];
  const pickers = new Set();

  function listen(element, event, callback) {
    element.addEventListener(event, callback);
    listeners.push(() => element.removeEventListener(event, callback));
  }
  function setStatus(element, message, isError = false) {
    element.textContent = message;
    element.hidden = !message;
    element.classList.toggle("is-error", isError);
  }
  function currentScope() {
    try {return normalizeScope({level: levelInput.value, grade: Number(gradeInput.value)}, {required: true});}
    catch {return null;}
  }
  function invalidateCombined() {
    selectionRevision++;
    combinedOutput.value = "";
    setStatus(combinedStatus, "");
  }
  function associationText(associations) {
    const text = Object.entries(associations).map(([level, grades]) =>
      (level === "primary" ? "Primary" : "Secondary") + ": " + grades.join(", ")).join("; ");
    return text || "Unassigned";
  }
  function updateControls() {
    const unavailable = disposed || loading || !loaded;
    seedInput.disabled = instructions.disabled = saveConfigButton.disabled = unavailable || savingConfig;
    retryButton.disabled = disposed || loading;
    form.setAttribute("aria-busy", String(savingConfig));
    for (const card of cards) {
      const hasEntry = Boolean(card.preview.value.trim());
      card.useSeed.disabled = unavailable || card.busy;
      card.override.disabled = unavailable || card.busy || !card.useSeed.checked;
      card.preview.disabled = unavailable || card.busy;
      card.draftPicker.setDisabled(unavailable || card.busy || !hasEntry);
      card.associationSection.hidden = !hasEntry;
      card.generate.disabled = unavailable || card.busy;
      card.save.disabled = unavailable || card.busy || !hasEntry || !Object.keys(card.draftPicker.getValue()).length;
      card.remove.disabled = unavailable || card.busy || !card.selected.size;
      card.remove.textContent = card.removing ? "Removing..."
        : "Remove selected" + (card.selected.size ? " (" + card.selected.size + ")" : "");
      for (const row of card.rows) {
        row.checkbox.disabled = unavailable || card.busy;
        row.picker.setDisabled(unavailable || card.busy);
        row.save.disabled = unavailable || card.busy
          || JSON.stringify(row.picker.getValue()) === JSON.stringify(row.entry.associations);
      }
      card.panel.setAttribute("aria-busy", String(card.busy));
    }
    levelInput.disabled = gradeInput.disabled = unavailable;
    const scope = currentScope();
    const missing = scope ? cards.filter(card => !card.entries.some(entry => matchesScope(entry, scope))) : [];
    combinedButton.disabled = unavailable || combining || !scope || missing.length > 0 || cards.some(card => card.removing);
    combinedAvailability.textContent = unavailable ? "Loading saved entries..."
      : !scope ? "Choose a level and grade to see matching entries."
      : missing.length ? "No matching saved entries for " + scope.level + " grade " + scope.grade + ": "
        + missing.map(card => card.vertical).join(", ") + ". Assign grades or save suitable entries first."
      : "Matching theme, setting and type entries are available.";
    byId("seed-combined-panel").setAttribute("aria-busy", String(combining));
  }
  function disposeRows(card) {
    for (const row of card.rows) {
      row.picker.dispose();
      pickers.delete(row.picker);
      row.save.removeEventListener("click", row.onSave);
    }
  }
  function renderEntries(card) {
    const open = new Set(card.rows.filter(row => row.details.open).map(row => entryKey(row.entry)));
    disposeRows(card);
    const available = new Set(card.entries.map(entryKey));
    card.selected = new Set([...card.selected].filter(key => available.has(key)));
    for (const key of card.associationDrafts.keys()) if (!available.has(key)) card.associationDrafts.delete(key);
    card.rows = [];
    const items = card.entries.map((entry, index) => {
      const key = entryKey(entry);
      const item = root.createElement("li");
      const label = root.createElement("label");
      label.className = "entry-choice";
      const checkbox = root.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = entry.value;
      checkbox.checked = card.selected.has(key);
      const text = root.createElement("span");
      text.textContent = entry.value;
      label.append(checkbox, text);
      const details = root.createElement("details");
      details.className = "association-details";
      details.open = open.has(key);
      const summary = root.createElement("summary");
      summary.textContent = associationText(entry.associations) + " \u00b7 Edit associations";
      const picker = createAssociationPicker({
        root, prefix: "seed-" + card.vertical + "-saved-" + index,
        associations: card.associationDrafts.get(key) || entry.associations,
        onChange() {card.associationDrafts.set(key, picker.getValue()); updateControls();},
      });
      pickers.add(picker);
      const save = root.createElement("button");
      save.type = "button";
      save.className = "secondary";
      save.textContent = "Save associations";
      const row = {entry, checkbox, details, picker, save};
      row.onSave = () => saveAssociations(card, row);
      save.addEventListener("click", row.onSave);
      details.append(summary, picker.element, save);
      item.append(label, details);
      card.rows.push(row);
      return item;
    });
    card.list.replaceChildren(...items);
    card.count.textContent = card.entries.length + " saved";
    card.empty.hidden = Boolean(card.entries.length);
    card.list.hidden = !card.entries.length;
  }
  function applySavedEntry(card, saved) {
    const key = entryKey(saved);
    const index = card.entries.findIndex(entry => entryKey(entry) === key);
    if (index < 0) card.entries.push(saved);
    else card.entries[index] = saved;
    card.associationDrafts.delete(key);
    renderEntries(card);
    invalidateCombined();
  }
  function renderConfig(config) {
    seedInput.value = config?.generationSeed || DEFAULT_QUESTION_GENERATION_SEED;
    instructions.value = config?.additionalLlmInstructions || "";
    updatedAt.textContent = config ? "Last saved: " + config.updatedAt.toLocaleString() : "Never saved";
  }

  async function loadPage() {
    if (disposed || loading || savingConfig || combining || cards.some(card => card.busy)) return;
    loading = true; loaded = false;
    retryButton.hidden = true;
    setStatus(status, "Loading settings and saved entries...");
    updateControls();
    try {
      const results = await Promise.allSettled([getConfig(), ...cards.map(card => getEntries({vertical: card.vertical}))]);
      if (disposed) return;
      const failures = results.filter(result => result.status === "rejected");
      if (failures.length) throw new Error(failures.map(result => result.reason?.message || "Could not load saved data.").join(" "));
      const pools = results.slice(1).map(result => normalizeEntries(result.value));
      renderConfig(results[0].value);
      cards.forEach((card, index) => {card.entries = pools[index]; renderEntries(card);});
      loaded = true;
      setStatus(status, "");
    } catch (error) {
      if (!disposed) {setStatus(status, error.message || "Could not load the question seed generator.", true); retryButton.hidden = false;}
    } finally {loading = false; if (!disposed) updateControls();}
  }
  async function saveSettings(event) {
    event.preventDefault();
    if (disposed || !loaded || savingConfig) return;
    const input = {generationSeed: seedInput.value.trim() || DEFAULT_QUESTION_GENERATION_SEED,
      additionalLlmInstructions: instructions.value.trim()};
    savingConfig = true; saveConfigButton.textContent = "Saving...";
    setStatus(configStatus, "Saving settings..."); updateControls();
    try {
      const config = await saveConfig(input);
      if (disposed) return;
      renderConfig(config); setStatus(configStatus, "Settings saved.");
    } catch (error) {if (!disposed) setStatus(configStatus, error.message || "Could not save settings.", true);}
    finally {savingConfig = false; if (!disposed) {saveConfigButton.textContent = "Save settings"; updateControls();}}
  }
  async function generateFor(card) {
    if (disposed || !loaded || card.busy) return;
    const useHighLevelSeed = card.useSeed.checked;
    const seed = useHighLevelSeed ? card.override.value.trim() || seedInput.value.trim() || DEFAULT_QUESTION_GENERATION_SEED : "";
    card.busy = true; card.generate.textContent = "Generating...";
    setStatus(card.status, useHighLevelSeed ? "Generating an entry using seed: " + seed : "Generating an entry without a high-level seed...");
    updateControls();
    try {
      const entry = normalizeEntry(await generateEntry({vertical: card.vertical,
        useHighLevelSeed, ...(useHighLevelSeed ? {seed} : {}), save: false}));
      if (disposed) return;
      card.preview.value = entry.value;
      card.draftPicker.setValue({});
      setStatus(card.status, "Entry generated. Select its levels and grades, then save it.");
    } catch (error) {if (!disposed) setStatus(card.status, error.message || "Could not generate an entry. Try again.", true);}
    finally {card.busy = false; if (!disposed) {card.generate.textContent = "Generate entry"; updateControls();}}
  }
  async function saveFor(card) {
    if (disposed || !loaded || card.busy || !card.preview.value.trim()) return;
    let entry;
    try {
      entry = normalizeEntry({value: card.preview.value,
        associations: normalizeAssociations(card.draftPicker.getValue(), {requireAssigned: true})});
    } catch (error) {setStatus(card.status, error.message, true); return;}
    card.busy = true; card.save.textContent = "Saving...";
    setStatus(card.status, "Saving entry..."); updateControls();
    try {
      const saved = normalizeEntry(await saveEntry({vertical: card.vertical, entry}));
      if (disposed) return;
      card.preview.value = ""; card.draftPicker.setValue({});
      applySavedEntry(card, saved); setStatus(card.status, "Entry saved.");
    } catch (error) {if (!disposed) setStatus(card.status, error.message || "Could not save this entry. Try again.", true);}
    finally {card.busy = false; if (!disposed) {card.save.textContent = "Save entry"; updateControls();}}
  }
  async function saveAssociations(card, row) {
    if (disposed || !loaded || card.busy || !card.rows.includes(row)) return;
    const entry = {value: row.entry.value, associations: row.picker.getValue()};
    card.busy = true; row.save.textContent = "Saving...";
    setStatus(card.status, "Saving associations for " + entry.value + "..."); updateControls();
    try {
      const saved = normalizeEntry(await saveEntry({vertical: card.vertical, entry}));
      if (disposed) return;
      applySavedEntry(card, saved); setStatus(card.status, "Associations saved.");
    } catch (error) {if (!disposed) setStatus(card.status, error.message || "Could not save associations. Try again.", true);}
    finally {card.busy = false; if (!disposed) {row.save.textContent = "Save associations"; updateControls();}}
  }
  async function removeFor(card) {
    if (disposed || !loaded || card.busy || !card.selected.size) return;
    const entries = card.entries.filter(entry => card.selected.has(entryKey(entry))).map(entry => entry.value);
    if (!entries.length) return;
    card.busy = card.removing = true;
    setStatus(card.status, "Removing selected entries..."); updateControls();
    try {
      const remaining = normalizeEntries(await removeEntries({vertical: card.vertical, entries}));
      if (disposed) return;
      card.entries = remaining; card.selected.clear(); renderEntries(card); invalidateCombined();
      setStatus(card.status, "Selected entries removed.");
    } catch (error) {if (!disposed) setStatus(card.status, error.message || "Could not remove selected entries. Try again.", true);}
    finally {card.busy = card.removing = false; if (!disposed) updateControls();}
  }
  async function combine() {
    const scope = currentScope();
    if (disposed || !loaded || combining || !scope || cards.some(card => card.removing || !card.entries.some(entry => matchesScope(entry, scope)))) return;
    const revision = selectionRevision;
    combining = true; combinedButton.textContent = "Combining...";
    setStatus(combinedStatus, "Selecting saved entries for " + scope.level + " grade " + scope.grade + "..."); updateControls();
    try {
      const seed = await getCombinedSeed(scope);
      if (disposed || revision !== selectionRevision) return;
      combinedOutput.value = seed; setStatus(combinedStatus, "Combined seed ready.");
    } catch (error) {
      if (!disposed && revision === selectionRevision) setStatus(combinedStatus, error.message || "Could not get a combined seed. Try again.", true);
    } finally {combining = false; if (!disposed) {combinedButton.textContent = "Get combined seed"; updateControls();}}
  }

  listen(form, "submit", saveSettings);
  listen(retryButton, "click", loadPage);
  listen(combinedButton, "click", combine);
  for (const input of [levelInput, gradeInput]) listen(input, "change", () => {invalidateCombined(); updateControls();});
  for (const input of [seedInput, instructions]) listen(input, "input", () => setStatus(configStatus, "You have unsaved settings."));
  for (const card of cards) {
    card.draftPicker = createAssociationPicker({root, prefix: "seed-" + card.vertical + "-draft",
      onChange() {
        if (card.preview.value.trim()) {
          setStatus(card.status, Object.keys(card.draftPicker.getValue()).length
            ? "Associations selected. Save entry to add it to the list."
            : "Select at least one level and grade before saving this entry.");
        }
        updateControls();
      },
    });
    byId("seed-" + card.vertical + "-associations").append(card.draftPicker.element);
    pickers.add(card.draftPicker);
    card.useSeed.checked = true;
    listen(card.useSeed, "change", updateControls);
    listen(card.preview, "input", () => {
      if (disposed || !loaded || card.busy) return;
      setStatus(card.status, !card.preview.value.trim() ? "Enter or generate an entry before saving."
        : Object.keys(card.draftPicker.getValue()).length ? "Entry ready. Save entry to add it to the list."
        : "Select at least one level and grade before saving this entry.");
      updateControls();
    });
    listen(card.generate, "click", () => generateFor(card));
    listen(card.save, "click", () => saveFor(card));
    listen(card.remove, "click", () => removeFor(card));
    listen(card.list, "change", event => {
      if (disposed || !loaded || card.busy || event.target?.type !== "checkbox") return;
      if (!card.rows.some(row => row.checkbox === event.target)) return;
      const key = entryKey(event.target.value);
      if (!card.entries.some(entry => entryKey(entry) === key)) return;
      if (event.target.checked) card.selected.add(key);
      else card.selected.delete(key);
      updateControls();
    });
  }
  seedInput.value = DEFAULT_QUESTION_GENERATION_SEED;
  updateControls();
  return {
    ready: loadPage(),
    dispose() {
      disposed = true; listeners.forEach(remove => remove());
      pickers.forEach(picker => picker.dispose());
      cards.forEach(card => disposeRows(card));
      updateControls();
    },
  };
}

if (typeof document !== "undefined" && document.getElementById("question-seed-admin")) mountQuestionSeedGeneratorAdmin();
