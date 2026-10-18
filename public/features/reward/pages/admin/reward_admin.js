import {
  DEFAULT_REWARD_CONFIG, getRewardConfig, saveRewardConfig,
  getAssessmentFrameworkRewardConfig, saveAssessmentFrameworkRewardConfig,
} from "../../reward_module.js?v=20261018-essay-progression-v1";
import {
  listAssessmentFrameworks, getAssessmentFrameworkById, ASSESSMENT_FRAMEWORK_END_LEVEL_ID,
} from "../../../assessment_framework/assessment_framework_module.js?v=20261018-topic-framework-v1";

export function mountRewardAdmin({
  root = document, getConfig = getRewardConfig, saveConfig = saveRewardConfig,
  listFrameworks = listAssessmentFrameworks, getFramework = getAssessmentFrameworkById,
  getFrameworkConfig = getAssessmentFrameworkRewardConfig,
  saveFrameworkConfig = saveAssessmentFrameworkRewardConfig,
} = {}) {
  const byId = (id) => root.getElementById(id);
  const globalForm = byId("reward-form");
  const frameworkForm = byId("framework-reward-form");
  const selector = byId("assessment-framework");
  const levelContainer = byId("level-coin-fields");
  const globalStatus = byId("global-status");
  const frameworkStatus = byId("framework-status");
  const globalFields = [
    ["dailyLoginCoins", "daily-login-coins"],
    ["dailyMissionCompletionCoins", "daily-mission-coins"],
    ["bonusMissionCompletionCoins", "bonus-mission-coins"],
    ["recentActivitiesLimit", "recent-activities-limit"],
    ...["3", "7", "14", "30"].map((days) => ["loginStreakCoins." + days, "streak-" + days + "-coins"]),
  ].map(([key, id]) => ({key, input: byId(id), error: byId(id + "-error"), required: true}));
  let levelFields = [];
  let globalLoaded = false;
  let globalBusy = false;
  let listLoaded = false;
  let listBusy = false;
  let levelsLoaded = false;
  let levelsLoading = false;
  let levelsSaving = false;
  let selectionVersion = 0;

  function setStatus(element, message, isError = false) {
    element.textContent = message;
    element.hidden = !message;
    element.classList.toggle("is-error", isError);
  }
  function setUpdatedAt(id, config) {
    byId(id).textContent = config?.updatedAt instanceof Date
      ? "Last saved: " + config.updatedAt.toLocaleString() : "Never saved";
  }
  function updateControls() {
    for (const field of globalFields) field.input.disabled = !globalLoaded || globalBusy;
    byId("save-global-config").disabled = !globalLoaded || globalBusy;
    byId("reset-global-config").disabled = !globalLoaded || globalBusy;
    byId("retry-global-load").disabled = globalBusy;
    selector.disabled = !listLoaded || !selector.options.length || listBusy || levelsSaving;
    byId("reload-frameworks").disabled = listBusy || levelsSaving;
    byId("retry-framework-load").disabled = listBusy || levelsLoading || levelsSaving;
    for (const field of levelFields) field.input.disabled = !levelsLoaded || levelsLoading || levelsSaving;
    byId("save-framework-config").disabled = !levelsLoaded || listBusy || levelsLoading || levelsSaving;
  }
  function clearError(field) {
    field.input.setCustomValidity("");
    field.input.removeAttribute("aria-invalid");
    field.error.textContent = "";
    field.error.hidden = true;
  }
  function clearErrors(fields) { fields.forEach(clearError); }
  function readCoins(fields) {
    let firstInvalid = null;
    const entries = [];
    for (const field of fields) {
      clearError(field);
      const raw = field.input.value.trim();
      if (!raw && !field.required) continue;
      const value = raw ? Number(raw) : NaN;
      const minimum = field.input.min === "" ? 0 : Number(field.input.min);
      const maximum = field.input.max === "" ? Number.MAX_SAFE_INTEGER : Number(field.input.max);
      if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
        const message = field.key === "recentActivitiesLimit"
          ? "Enter a whole number of activities from " + minimum + " to " + maximum + "."
          : "Enter a whole number of coins from 0 to " + Number.MAX_SAFE_INTEGER + ".";
        field.input.setCustomValidity(message);
        field.input.setAttribute("aria-invalid", "true");
        field.error.textContent = message;
        field.error.hidden = false;
        firstInvalid ||= field.input;
      } else {
        entries.push([field.key, value]);
      }
    }
    if (firstInvalid) {
      firstInvalid.focus();
      firstInvalid.reportValidity();
      return null;
    }
    return Object.fromEntries(entries);
  }
  function fillGlobal(config) {
    for (const field of globalFields) {
      const [key, days] = field.key.split(".");
      field.input.value = days ? config.loginStreakCoins[days] : config[key];
    }
    clearErrors(globalFields);
  }
  async function loadGlobal() {
    if (globalBusy) return;
    globalBusy = true;
    globalLoaded = false;
    byId("retry-global-load").hidden = true;
    updateControls();
    setStatus(globalStatus, "Loading reward configuration…");
    try {
      const config = await getConfig();
      fillGlobal(config || DEFAULT_REWARD_CONFIG);
      setUpdatedAt("global-updated-at", config);
      globalLoaded = true;
      setStatus(globalStatus, config ? "" : "Default rewards are shown. Save to apply them.");
    } catch (error) {
      byId("retry-global-load").hidden = false;
      setStatus(globalStatus, error.message || "Unable to load reward configuration.", true);
    } finally {
      globalBusy = false;
      updateControls();
    }
  }
  function renderLevels(framework, config) {
    levelContainer.replaceChildren();
    levelFields = [];
    const levels = [...(framework.levels || [])].sort((a, b) => (
      a.sequenceOrder - b.sequenceOrder || a.levelName.localeCompare(b.levelName)
    ));
    const definitions = levels.map((level) => ({key: level.id, label: level.levelName, required: true}));
    if (framework.endLevelName && !levels.some((level) => level.id === ASSESSMENT_FRAMEWORK_END_LEVEL_ID)) {
      definitions.push({
        key: ASSESSMENT_FRAMEWORK_END_LEVEL_ID,
        label: framework.endLevelName + " (final level, optional)", required: false,
      });
    }
    for (const [index, definition] of definitions.entries()) {
      const id = "level-coins-" + index;
      const row = root.createElement("div");
      row.className = "config-row";
      const label = root.createElement("label");
      label.htmlFor = id;
      label.textContent = definition.label;
      const control = root.createElement("div");
      const input = root.createElement("input");
      input.id = id;
      input.name = definition.key;
      input.dataset.levelId = definition.key;
      input.type = "number";
      input.min = "0";
      input.max = String(Number.MAX_SAFE_INTEGER);
      input.step = "1";
      input.required = definition.required;
      input.disabled = true;
      input.setAttribute("aria-describedby", "coin-help " + id + "-error");
      input.value = config && Object.hasOwn(config.levelCoins, definition.key) ? config.levelCoins[definition.key] : "";
      const error = root.createElement("span");
      error.id = id + "-error";
      error.className = "field-error";
      error.hidden = true;
      const field = {...definition, input, error};
      input.addEventListener("input", () => clearError(field));
      levelFields.push(field);
      control.append(input, error);
      row.append(label, control);
      levelContainer.append(row);
    }
  }
  async function loadSelectedFramework() {
    if (!listLoaded || !selector.value || levelsSaving) return;
    const assessmentFrameworkId = selector.value;
    const version = ++selectionVersion;
    levelsLoaded = false;
    levelsLoading = true;
    levelFields = [];
    levelContainer.replaceChildren();
    byId("retry-framework-load").hidden = true;
    setUpdatedAt("framework-updated-at", null);
    updateControls();
    setStatus(frameworkStatus, "Loading assessment levels and coin rewards…");
    try {
      const [framework, config] = await Promise.all([
        getFramework(assessmentFrameworkId), getFrameworkConfig({assessmentFrameworkId}),
      ]);
      if (version !== selectionVersion) return;
      if (!framework) throw new Error("This framework is no longer available. Reload the frameworks.");
      renderLevels(framework, config);
      setUpdatedAt("framework-updated-at", config);
      levelsLoaded = true;
      const missing = levelFields.some((field) => field.required && field.input.value === "");
      setStatus(frameworkStatus, missing ? "Enter a coin value for each assessment level before saving."
        : levelFields.length ? "" : "This framework has no assessment levels.");
    } catch (error) {
      if (version !== selectionVersion) return;
      byId("retry-framework-load").hidden = false;
      setStatus(frameworkStatus, error.message || "Unable to load assessment level rewards.", true);
    } finally {
      if (version === selectionVersion) {
        levelsLoading = false;
        updateControls();
      }
    }
  }
  async function loadFrameworkList() {
    if (listBusy || levelsSaving) return;
    const previousId = selector.value;
    ++selectionVersion;
    listLoaded = false;
    listBusy = true;
    levelsLoaded = false;
    levelsLoading = false;
    levelFields = [];
    levelContainer.replaceChildren();
    byId("retry-framework-load").hidden = true;
    setUpdatedAt("framework-updated-at", null);
    updateControls();
    setStatus(frameworkStatus, "Loading assessment frameworks…");
    try {
      const frameworks = await listFrameworks();
      selector.replaceChildren();
      for (const framework of frameworks) {
        const option = root.createElement("option");
        option.value = framework.id;
        option.textContent = framework.name;
        selector.append(option);
      }
      if (frameworks.some((framework) => framework.id === previousId)) selector.value = previousId;
      listLoaded = true;
      if (!frameworks.length) setStatus(frameworkStatus, "No assessment frameworks are available.");
    } catch (error) {
      setStatus(frameworkStatus, error.message || "Unable to load assessment frameworks. Try reloading them.", true);
    } finally {
      listBusy = false;
      updateControls();
    }
    if (listLoaded && selector.value) await loadSelectedFramework();
  }
  globalForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!globalLoaded || globalBusy) return;
    const values = readCoins(globalFields);
    if (!values) {
      setStatus(globalStatus, "Check the highlighted configuration values.", true);
      return;
    }
    const input = {
      dailyLoginCoins: values.dailyLoginCoins,
      dailyMissionCompletionCoins: values.dailyMissionCompletionCoins,
      bonusMissionCompletionCoins: values.bonusMissionCompletionCoins,
      recentActivitiesLimit: values.recentActivitiesLimit,
      loginStreakCoins: Object.fromEntries(["3", "7", "14", "30"].map((days) => [days, values["loginStreakCoins." + days]])),
    };
    globalBusy = true;
    updateControls();
    setStatus(globalStatus, "Saving reward configuration…");
    try {
      const config = await saveConfig(input);
      fillGlobal(config);
      setUpdatedAt("global-updated-at", config);
      setStatus(globalStatus, "Reward configuration saved.");
    } catch (error) {
      setStatus(globalStatus, error.message || "Unable to save reward configuration.", true);
    } finally {
      globalBusy = false;
      updateControls();
    }
  });
  frameworkForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!levelsLoaded || listBusy || levelsLoading || levelsSaving) return;
    const levelCoins = readCoins(levelFields);
    if (!levelCoins) {
      setStatus(frameworkStatus, "Check the highlighted level coin values.", true);
      return;
    }
    const assessmentFrameworkId = selector.value;
    levelsSaving = true;
    updateControls();
    setStatus(frameworkStatus, "Saving assessment level rewards…");
    try {
      const config = await saveFrameworkConfig({assessmentFrameworkId, levelCoins});
      setUpdatedAt("framework-updated-at", config);
      setStatus(frameworkStatus, "Assessment level rewards saved.");
    } catch (error) {
      setStatus(frameworkStatus, error.message || "Unable to save assessment level rewards.", true);
    } finally {
      levelsSaving = false;
      updateControls();
    }
  });
  globalFields.forEach((field) => field.input.addEventListener("input", () => clearError(field)));
  byId("reset-global-config").addEventListener("click", () => {
    if (!globalLoaded || globalBusy) return;
    fillGlobal(DEFAULT_REWARD_CONFIG);
    setStatus(globalStatus, "Default rewards restored in the form. Save to apply them.");
  });
  byId("retry-global-load").addEventListener("click", () => { void loadGlobal(); });
  byId("reload-frameworks").addEventListener("click", () => { void loadFrameworkList(); });
  byId("retry-framework-load").addEventListener("click", () => { void loadSelectedFramework(); });
  selector.addEventListener("change", () => { void loadSelectedFramework(); });
  return {ready: Promise.all([loadGlobal(), loadFrameworkList()])};
}
if (typeof document !== "undefined" && document.getElementById("reward-form")) {
  mountRewardAdmin();
}
