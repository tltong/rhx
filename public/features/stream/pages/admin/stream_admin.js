import {
  attachSyllabusToStreamYear,
  createStream,
  deleteStream,
  detachSyllabusFromStreamYear,
  getStreamById,
  listEligibleSyllabuses,
  listStreamCountries,
  listStreamLevels,
  listStreams,
  listStreamYears,
  renameStream
} from "../../stream_module.js?v=20260823-stream-language-v1";

const streamSelect = document.querySelector("#stream-select");
const newStreamButton = document.querySelector("#new-stream");
const streamNameInput = document.querySelector("#stream-name");
const countrySelect = document.querySelector("#country-select");
const levelSelect = document.querySelector("#level-select");
const saveStreamButton = document.querySelector("#save-stream");
const confirmDeleteInput = document.querySelector("#confirm-delete-stream");
const deleteStreamButton = document.querySelector("#delete-stream");
const yearOptions = document.querySelector("#year-options");
const yearPanels = document.querySelector("#year-panels");
const statusMessage = document.querySelector("#status-message");

let loadedStream = null;
let pageBusy = false;
let availableYears = [];
let selectedYears = new Set();
const eligibleSyllabusesByYear = new Map();

function normalizeText(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function clearSelect(select, placeholder) {
  select.replaceChildren();

  const option = document.createElement("option");
  option.value = "";
  option.textContent = placeholder;
  select.append(option);
}

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

function updateControls() {
  streamSelect.disabled = pageBusy;
  newStreamButton.disabled = pageBusy;
  streamNameInput.disabled = pageBusy;
  countrySelect.disabled = pageBusy || Boolean(loadedStream);
  levelSelect.disabled = pageBusy
    || Boolean(loadedStream)
    || !countrySelect.value;
  saveStreamButton.disabled = pageBusy;
  saveStreamButton.textContent = loadedStream
    ? "Save Stream Name"
    : "Create Stream";
  confirmDeleteInput.disabled = pageBusy || !loadedStream;
  deleteStreamButton.disabled = pageBusy
    || !loadedStream
    || !confirmDeleteInput.checked;

  yearOptions.querySelectorAll("input").forEach((input) => {
    input.disabled = pageBusy;
  });
  yearPanels.querySelectorAll("button, select").forEach((control) => {
    control.disabled = pageBusy || control.dataset.unavailable === "true";
  });
}

function setBusy(isBusy) {
  pageBusy = isBusy;
  updateControls();
}

function renderStreamOptions(streams, selectedStreamId = "") {
  clearSelect(
    streamSelect,
    streams.length
      ? `Select stream (${streams.length})`
      : "No saved streams"
  );

  streams.forEach((stream) => {
    const option = document.createElement("option");
    option.value = stream.id;
    option.textContent = `${stream.name} / ${stream.country} / ${stream.level}`;
    streamSelect.append(option);
  });

  streamSelect.value = selectedStreamId;
}

async function refreshStreamOptions(selectedStreamId = "") {
  const streams = await listStreams();
  renderStreamOptions(streams, selectedStreamId);
  return streams;
}

function renderCountryOptions(countries, selectedCountry = "") {
  clearSelect(
    countrySelect,
    countries.length ? "Select country" : "No syllabus scope countries"
  );

  countries.forEach((country) => {
    const option = document.createElement("option");
    option.value = country;
    option.textContent = country;
    countrySelect.append(option);
  });

  countrySelect.value = selectedCountry;
}

async function loadLevelOptions(selectedLevel = "") {
  const country = countrySelect.value;

  if (!country) {
    clearSelect(levelSelect, "Select country first");
    return [];
  }

  const levels = await listStreamLevels(country);

  clearSelect(levelSelect, levels.length ? "Select level" : "No levels");
  levels.forEach((level) => {
    const option = document.createElement("option");
    option.value = level;
    option.textContent = level[0].toUpperCase() + level.slice(1);
    levelSelect.append(option);
  });
  levelSelect.value = selectedLevel;

  return levels;
}

function getYearAssignment(year) {
  return loadedStream?.years.find((assignment) => (
    Number(assignment.year) === Number(year)
  )) || null;
}

function renderYearOptions() {
  yearOptions.replaceChildren();

  if (!countrySelect.value || !levelSelect.value) {
    const message = document.createElement("p");
    message.className = "empty-state";
    message.textContent = "Select a country and level to load years.";
    yearOptions.append(message);
    return;
  }

  if (availableYears.length === 0) {
    const message = document.createElement("p");
    message.className = "empty-state";
    message.textContent = "No years are available for this scope.";
    yearOptions.append(message);
    return;
  }

  availableYears.forEach((year) => {
    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    const text = document.createElement("span");

    label.className = "year-option";
    checkbox.type = "checkbox";
    checkbox.value = String(year);
    checkbox.checked = selectedYears.has(year);
    checkbox.disabled = pageBusy;
    checkbox.addEventListener("change", () => toggleYear(year, checkbox.checked));
    text.textContent = `Year ${year}`;
    label.append(checkbox, text);
    yearOptions.append(label);
  });
}

function syllabusLabel(syllabus) {
  const state = syllabus.active ? "" : " (inactive)";

  return `${syllabus.subject} / Year ${syllabus.year} / ${syllabus.id}${state}`;
}

function renderLanguageOptions(languageSelect, syllabus) {
  const languages = syllabus?.languages || [];
  const placeholder = !syllabus
    ? "Select syllabus first"
    : languages.length
      ? "Select language"
      : "No languages available";

  clearSelect(languageSelect, placeholder);
  languages.forEach((language) => {
    const option = document.createElement("option");
    option.value = language;
    option.textContent = language;
    languageSelect.append(option);
  });

  const unavailable = !syllabus || languages.length === 0;
  languageSelect.dataset.unavailable = String(unavailable);
  languageSelect.disabled = pageBusy || unavailable;
}

function renderAttachedSyllabuses(panel, year, eligibleSyllabuses) {
  const attachedList = panel.querySelector("[data-role='attached-list']");
  const assignment = getYearAssignment(year);
  const syllabusAssignments = assignment?.syllabuses || [];
  const syllabusMap = new Map(
    eligibleSyllabuses.map((syllabus) => [syllabus.id, syllabus])
  );

  attachedList.replaceChildren();

  if (syllabusAssignments.length === 0) {
    const message = document.createElement("p");
    message.className = "empty-state";
    message.textContent = "No syllabuses attached.";
    attachedList.append(message);
    return;
  }

  syllabusAssignments.forEach(({ syllabusId, language }) => {
    const item = document.createElement("div");
    const label = document.createElement("strong");
    const removeButton = document.createElement("button");
    const syllabus = syllabusMap.get(syllabusId);
    const languageLabel = language || "Language not selected";

    item.className = "attached-item";
    label.textContent = `${syllabus ? syllabusLabel(syllabus) : syllabusId} / ${languageLabel}`;
    removeButton.type = "button";
    removeButton.className = "danger";
    removeButton.textContent = "Remove";
    removeButton.disabled = pageBusy;
    removeButton.addEventListener("click", () => (
      removeSyllabus(year, syllabusId)
    ));
    item.append(label, removeButton);
    attachedList.append(item);
  });
}

function renderYearPanels() {
  yearPanels.replaceChildren();

  [...selectedYears]
    .sort((first, second) => first - second)
    .forEach((year) => {
      const panel = document.createElement("section");
      const header = document.createElement("div");
      const heading = document.createElement("h2");
      const assignmentRow = document.createElement("div");
      const syllabusField = document.createElement("label");
      const syllabusFieldLabel = document.createElement("span");
      const syllabusSelect = document.createElement("select");
      const languageField = document.createElement("label");
      const languageFieldLabel = document.createElement("span");
      const languageSelect = document.createElement("select");
      const attachButton = document.createElement("button");
      const attachedList = document.createElement("div");
      const eligibleSyllabuses = eligibleSyllabusesByYear.get(year) || [];
      const attachedIds = new Set(
        getYearAssignment(year)?.syllabusIds || []
      );
      const availableSyllabuses = eligibleSyllabuses.filter(
        (syllabus) => !attachedIds.has(syllabus.id)
      );

      panel.className = "year-panel";
      panel.dataset.year = String(year);
      header.className = "year-panel-header";
      heading.textContent = `Year ${year}`;
      header.append(heading);

      assignmentRow.className = "assignment-row";
      syllabusField.className = "field";
      syllabusFieldLabel.textContent = "Syllabus";
      clearSelect(
        syllabusSelect,
        availableSyllabuses.length
          ? "Select syllabus"
          : "No additional syllabuses"
      );
      availableSyllabuses.forEach((syllabus) => {
        const option = document.createElement("option");
        option.value = syllabus.id;
        option.textContent = syllabusLabel(syllabus);
        syllabusSelect.append(option);
      });
      syllabusSelect.dataset.role = "syllabus-select";
      syllabusSelect.dataset.unavailable = String(
        !loadedStream || availableSyllabuses.length === 0
      );
      syllabusSelect.disabled = pageBusy
        || !loadedStream
        || availableSyllabuses.length === 0;
      syllabusField.append(syllabusFieldLabel, syllabusSelect);

      languageField.className = "field";
      languageFieldLabel.textContent = "Language";
      renderLanguageOptions(languageSelect, null);
      languageField.append(languageFieldLabel, languageSelect);

      const syncAttachButton = () => {
        const unavailable = !loadedStream
          || !syllabusSelect.value
          || !languageSelect.value;
        attachButton.dataset.unavailable = String(unavailable);
        attachButton.disabled = pageBusy || unavailable;
      };

      syllabusSelect.addEventListener("change", () => {
        const syllabus = availableSyllabuses.find(
          (item) => item.id === syllabusSelect.value
        ) || null;
        renderLanguageOptions(languageSelect, syllabus);
        syncAttachButton();
      });
      languageSelect.addEventListener("change", syncAttachButton);

      attachButton.type = "button";
      attachButton.textContent = "Attach Syllabus";
      syncAttachButton();
      attachButton.addEventListener("click", () => {
        attachSyllabus(
          year,
          syllabusSelect.value,
          languageSelect.value
        );
      });
      assignmentRow.append(syllabusField, languageField, attachButton);

      attachedList.className = "attached-list";
      attachedList.dataset.role = "attached-list";
      panel.append(header, assignmentRow, attachedList);
      yearPanels.append(panel);
      renderAttachedSyllabuses(panel, year, eligibleSyllabuses);
    });
}
async function loadEligibleSyllabuses(year) {
  const syllabuses = await listEligibleSyllabuses({
    country: countrySelect.value,
    level: levelSelect.value,
    year
  });

  eligibleSyllabusesByYear.set(year, syllabuses);
  return syllabuses;
}

async function loadYearOptions(nextSelectedYears = []) {
  eligibleSyllabusesByYear.clear();
  selectedYears = new Set(nextSelectedYears.map(Number));

  if (!countrySelect.value || !levelSelect.value) {
    availableYears = [];
    selectedYears.clear();
    renderYearOptions();
    renderYearPanels();
    return;
  }

  availableYears = await listStreamYears(
    countrySelect.value,
    levelSelect.value
  );
  selectedYears = new Set(
    [...selectedYears].filter((year) => availableYears.includes(year))
  );

  await Promise.all([...selectedYears].map(loadEligibleSyllabuses));
  renderYearOptions();
  renderYearPanels();
}

async function toggleYear(year, checked) {
  setBusy(true);
  clearStatus();

  try {
    if (checked) {
      selectedYears.add(year);
      await loadEligibleSyllabuses(year);
    } else {
      selectedYears.delete(year);
      eligibleSyllabusesByYear.delete(year);
    }

    renderYearOptions();
    renderYearPanels();
  } catch (error) {
    setStatus(error.message || "Could not load year syllabuses.", true);
  } finally {
    setBusy(false);
  }
}

function prepareNewStream() {
  loadedStream = null;
  streamSelect.value = "";
  streamNameInput.value = "";
  countrySelect.value = "";
  clearSelect(levelSelect, "Select country first");
  confirmDeleteInput.checked = false;
  availableYears = [];
  selectedYears.clear();
  eligibleSyllabusesByYear.clear();
  renderYearOptions();
  renderYearPanels();
  updateControls();
  setStatus("Ready to create a stream.");
}

async function displayStream(stream, message = "Stream loaded.") {
  loadedStream = stream;
  streamSelect.value = stream.id;
  streamNameInput.value = stream.name;
  countrySelect.value = stream.country;
  confirmDeleteInput.checked = false;
  await loadLevelOptions(stream.level);
  await loadYearOptions(stream.years.map((assignment) => assignment.year));
  updateControls();
  setStatus(message);
}

async function saveCurrentStream() {
  const name = normalizeText(streamNameInput.value);

  if (!name) {
    setStatus("Stream name is required.", true);
    return;
  }

  if (!loadedStream && !countrySelect.value) {
    setStatus("Country is required.", true);
    return;
  }

  if (!loadedStream && !levelSelect.value) {
    setStatus("Level is required.", true);
    return;
  }

  setBusy(true);
  clearStatus();

  try {
    const wasExistingStream = Boolean(loadedStream);

    loadedStream = loadedStream
      ? await renameStream(loadedStream.id, name)
      : await createStream({
        name,
        country: countrySelect.value,
        level: levelSelect.value
      });

    await refreshStreamOptions(loadedStream.id);
    await displayStream(
      loadedStream,
      wasExistingStream ? "Stream name saved." : "Stream created."
    );
  } catch (error) {
    setStatus(error.message || "Could not save stream.", true);
  } finally {
    setBusy(false);
  }
}

async function loadSelectedStream() {
  const streamId = streamSelect.value;

  if (!streamId) {
    return;
  }

  setBusy(true);
  clearStatus();

  try {
    const stream = await getStreamById(streamId);

    if (!stream) {
      throw new Error("Selected stream could not be found.");
    }

    await displayStream(stream);
  } catch (error) {
    setStatus(error.message || "Could not load stream.", true);
  } finally {
    setBusy(false);
  }
}

async function attachSyllabus(year, syllabusId, language) {
  if (!loadedStream || !syllabusId || !language) {
    return;
  }

  setBusy(true);
  clearStatus();

  try {
    await attachSyllabusToStreamYear({
      streamId: loadedStream.id,
      year,
      syllabusId,
      language
    });
    loadedStream = await getStreamById(loadedStream.id);
    await loadYearOptions([...selectedYears]);
    setStatus(`Syllabus attached to Year ${year}.`);
  } catch (error) {
    setStatus(error.message || "Could not attach syllabus.", true);
  } finally {
    setBusy(false);
  }
}

async function removeSyllabus(year, syllabusId) {
  if (!loadedStream) {
    return;
  }

  setBusy(true);
  clearStatus();

  try {
    await detachSyllabusFromStreamYear({
      streamId: loadedStream.id,
      year,
      syllabusId,
      language
    });
    loadedStream = await getStreamById(loadedStream.id);
    await loadYearOptions([...selectedYears]);
    setStatus(`Syllabus removed from Year ${year}.`);
  } catch (error) {
    setStatus(error.message || "Could not remove syllabus.", true);
  } finally {
    setBusy(false);
  }
}

async function deleteCurrentStream() {
  if (!loadedStream || !confirmDeleteInput.checked) {
    setStatus("Confirm deletion before deleting the stream.", true);
    return;
  }

  const deletedName = loadedStream.name;

  setBusy(true);
  clearStatus();

  try {
    await deleteStream(loadedStream.id);
    loadedStream = null;
    const streams = await refreshStreamOptions();

    if (streams.length > 0) {
      const nextStream = await getStreamById(streams[0].id);
      await displayStream(nextStream, `${deletedName} deleted.`);
    } else {
      prepareNewStream();
      setStatus(`${deletedName} deleted. No saved streams remain.`);
    }
  } catch (error) {
    setStatus(error.message || "Could not delete stream.", true);
  } finally {
    setBusy(false);
  }
}

async function handleCountryChange() {
  setBusy(true);
  clearStatus();

  try {
    await loadLevelOptions();
    await loadYearOptions();
  } catch (error) {
    setStatus(error.message || "Could not load levels.", true);
  } finally {
    setBusy(false);
  }
}

async function handleLevelChange() {
  setBusy(true);
  clearStatus();

  try {
    await loadYearOptions();
  } catch (error) {
    setStatus(error.message || "Could not load years.", true);
  } finally {
    setBusy(false);
  }
}

async function initPage() {
  renderYearOptions();

  setBusy(true);
  try {
    const [countries, streams] = await Promise.all([
      listStreamCountries(),
      listStreams()
    ]);

    renderCountryOptions(countries);
    renderStreamOptions(streams);

    if (streams.length > 0) {
      const stream = await getStreamById(streams[0].id);
      await displayStream(stream, `Loaded ${streams.length} saved streams.`);
    } else {
      prepareNewStream();
      setStatus("No saved streams found. Create the first stream.");
    }
  } catch (error) {
    setStatus(error.message || "Could not load stream admin data.", true);
  } finally {
    setBusy(false);
  }
}

streamSelect.addEventListener("change", loadSelectedStream);
newStreamButton.addEventListener("click", prepareNewStream);
countrySelect.addEventListener("change", handleCountryChange);
levelSelect.addEventListener("change", handleLevelChange);
saveStreamButton.addEventListener("click", saveCurrentStream);
confirmDeleteInput.addEventListener("change", updateControls);
deleteStreamButton.addEventListener("click", deleteCurrentStream);

initPage();
