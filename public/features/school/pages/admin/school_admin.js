import * as api from "../../school_module.js?v=20261109-schools-v1";
import {listSyllabusScopes} from "../../../syllabusscope/syllabusscope_module.js?v=20261104-fill-preassessment-v3";
import {createSearchableList} from "../../../searchable_list/searchable_list_module.js?v=20261110-autocomplete-v1";
import {createSchoolSearchProvider} from "../../school_search_module.js?v=20261110-admin-autocomplete-v1";

const $ = id => document.getElementById(id);
let busy = false, scopes = [], states = [], streams = [], school = null, state = null, locality = null;
let localityCache = new Map(), searchFiltersKey = "", searchNeedsRefresh = false;
let stateLoadFailed = false, localityLoadFailed = false;
const country = () => $("country").value, level = () => $("level").value;
const schoolSearch = createSearchableList({container: $("school-search"), label: "Search schools", placeholder: "Type a school name…",
  loadItems: createSchoolSearchProvider({api}), pageSize: 10,
  getItemDescription: record => [record.schoolCode, record.localityName, record.stateName, record.status === "archived" ? "Archived" : "Active",
    record.streamId ? streams.find(item => item.id === record.streamId)?.name || "Stream unavailable" : "No stream assigned"].filter(Boolean).join(" · "),
  onSelect: record => {
    if (!record) return;
    void run(async () => {
      const saved = await api.getSchool(record.id);
      if (!saved) throw new Error("This school no longer exists. Reload the directory.");
      await fillSchool(saved); message("School loaded.");
    }).then(success => {if (success) $("school-name").focus(); else schoolSearch.setSelection(school);});
  },
});
function message(text, error = false) {
  $("status").textContent = text;
  $("status").hidden = !text;
  $("status").classList.toggle("error", error);
}
function controls() {
  document.querySelectorAll("button, input, select").forEach(element => {if (!element.closest("#school-search")) element.disabled = busy;});
  const disabled = (id, condition) => {$(id).disabled = busy || condition;};
  disabled("country", !scopes.length);
  disabled("level", !country());
  for (const id of ["new-school", "save-school"]) disabled(id, !country() || !level());
  for (const id of ["filter-state", "state-record", "state-name", "save-state", "locality-state"]) disabled(id, !country());
  for (const id of ["filter-locality"]) disabled(id, !$("filter-state").value);
  for (const id of ["locality-record", "locality-name", "save-locality"]) disabled(id, !$("locality-state").value);
  disabled("save-state", !country() || stateLoadFailed);
  disabled("save-locality", !$("locality-state").value || localityLoadFailed);
  disabled("school-locality", !$("school-state").value);
  disabled("archive-school", !school || school.status === "archived");
  disabled("archive-state", !state || state.status === "archived");
  disabled("archive-locality", !locality || locality.status === "archived");
  const blocked = busy || !country() || !level();
  schoolSearch.setDisabled(blocked);
  const input = filters(), key = JSON.stringify(input);
  if (key !== searchFiltersKey) {schoolSearch.setFilters(input); searchFiltersKey = key; searchNeedsRefresh = true;}
  $("school-search-context").textContent = country() && level()
    ? "Suggestions update as you type. State and city/town are optional. Select a school to edit it."
    : "Choose a country and level to search schools.";
  if (!blocked && searchNeedsRefresh) {searchNeedsRefresh = false; void schoolSearch.refresh();}
}
async function run(action) {
  if (busy) return false;
  busy = true; controls(); message("");
  try {await action(); return true;} catch (error) {message(error.message || "The request failed. Reload and try again.", true); return false;}
  finally {busy = false; controls();}
}
function options(id, records, placeholder, selected = "") {
  const select = $(id);
  select.replaceChildren(new Option(placeholder, ""));
  records.forEach(record => select.add(new Option(record.name + (record.status === "archived" ? " (archived)" : ""), record.id)));
  select.value = selected;
}
// Only small location/stream lookup lists are collected. School records always stay paginated.
async function lookup(method, input) {
  const items = [], seen = new Set();
  let cursor = null;
  do {
    const page = await method({...input, limit: 100, ...(cursor ? {cursor} : {})});
    items.push(...page.items); cursor = page.nextCursor;
    if (cursor && seen.has(cursor)) throw new Error("The lookup could not finish. Reload the directory.");
    seen.add(cursor);
  } while (cursor);
  return items;
}
function localities(stateId) {
  if (!stateId) return Promise.resolve([]);
  if (!localityCache.has(stateId)) localityCache.set(stateId,
    lookup(api.listLocalities, {country: country(), stateId, status: "all"}).catch(error => {localityCache.delete(stateId); throw error;}));
  return localityCache.get(stateId);
}
async function localityOptions(id, stateId, placeholder, selected = "") {
  options(id, await localities(stateId), placeholder, selected);
}
function updateContext() {
  $("school-context").textContent = country() && level() ? `${country()} / ${level()}` : "Choose a country and level above.";
}
function resetSchool() {
  school = null; schoolSearch.setSelection(null); $("school-form").reset();
  options("school-locality", [], "Select city/town");
  $("editor-heading").textContent = "New school";
  $("save-school").textContent = "Create school";
  updateContext();
}
function fillState(record) {
  stateLoadFailed = false;
  state = record;
  if (record && !Array.from($("state-record").options).some(option => option.value === record.id)) $("state-record").add(new Option(record.name, record.id));
  $("state-record").value = record?.id || "";
  $("state-name").value = record?.name || "";
  $("state-status").value = record?.status || "active";
  $("save-state").textContent = record ? "Save state" : "Create state";
}
function fillLocality(record) {
  localityLoadFailed = false;
  locality = record;
  if (record && !Array.from($("locality-record").options).some(option => option.value === record.id)) $("locality-record").add(new Option(record.name, record.id));
  $("locality-record").value = record?.id || "";
  $("locality-name").value = record?.name || "";
  $("locality-type").value = record?.type || "city";
  $("locality-status").value = record?.status || "active";
  $("save-locality").textContent = record ? "Save city/town" : "Create city/town";
}
async function refreshLocations() {
  searchNeedsRefresh = true;
  states = country() ? await lookup(api.listStates, {country: country(), status: "all"}) : [];
  localityCache = new Map();
  for (const [id, placeholder] of [["filter-state", "All states"], ["school-state", "Select state"], ["state-record", "New state"], ["locality-state", "Select state"]]) {
    options(id, states, placeholder, $(id).value);
  }
  await Promise.all([
    localityOptions("filter-locality", $("filter-state").value, "All cities/towns", $("filter-locality").value),
    localityOptions("school-locality", $("school-state").value, "Select city/town", $("school-locality").value),
    localityOptions("locality-record", $("locality-state").value, "New city/town", $("locality-record").value),
  ]);
}
async function refreshStreams() {
  streams = country() && level() ? await lookup(api.listSchoolStreams, {country: country(), level: level()}) : [];
  options("school-stream", streams, "No stream assigned", $("school-stream").value);
}
function filters() {
  return {country: country(), level: level(), status: $("filter-status").value,
    ...($("filter-state").value ? {stateId: $("filter-state").value} : {}),
    ...($("filter-locality").value ? {localityId: $("filter-locality").value} : {})};
}
function loadSchools() {searchNeedsRefresh = true;}
async function fillSchool(record) {
  // Populate lookups before changing the editor, preserving unsaved input if loading fails.
  const places = await localities(record.stateId);
  school = record;
  $("editor-heading").textContent = "Edit school"; $("save-school").textContent = "Save school";
  $("school-name").value = record.name; $("school-code").value = record.schoolCode || "";
  $("school-state").value = record.stateId;
  options("school-locality", places, "Select city/town", record.localityId);
  options("school-stream", streams, "No stream assigned", record.streamId || "");
  if (record.streamId && !streams.some(item => item.id === record.streamId)) {
    $("school-stream").add(new Option("Unavailable stream — choose a replacement or no stream", record.streamId));
    $("school-stream").value = record.streamId;
  }
  $("school-status").value = record.status;
  schoolSearch.setSelection(record);
  updateContext();
}
async function changeScope(changedCountry = false) {
  resetSchool();
  if (changedCountry) {
    fillState(null); fillLocality(null);
    for (const id of ["filter-state", "school-state", "state-record", "locality-state"]) $(id).value = "";
    const available = Object.entries(scopes.find(item => item.country === country())?.levels || {})
      .filter(([, years]) => Object.values(years || {}).some(value => value === true)).map(([id]) => ({id, name: id}));
    options("level", available, "Select level");
    await refreshLocations();
  }
  await refreshStreams(); updateContext(); await loadSchools();
}
$("country").addEventListener("change", () => run(() => changeScope(true)));
$("level").addEventListener("change", () => run(() => changeScope()));
$("reload").addEventListener("click", () => run(async () => {
  if (!scopes.length) await loadScopes();
  const stateId = state?.id || (stateLoadFailed ? $("state-record").value : "");
  const localityId = locality?.id || (localityLoadFailed ? $("locality-record").value : "");
  await refreshLocations(); await refreshStreams();
  if (school) {
    const saved = await api.getSchool(school.id);
    if (saved) await fillSchool(saved); else resetSchool();
  }
  if (stateId) fillState(await api.getState(stateId));
  if (localityId) fillLocality(await api.getLocality(localityId));
  await loadSchools(); message("Directory reloaded.");
}));
$("filter-state").addEventListener("change", () => run(async () => {
  options("filter-locality", [], "All cities/towns");
  await localityOptions("filter-locality", $("filter-state").value, "All cities/towns"); await loadSchools();
}));
for (const id of ["filter-locality", "filter-status"]) $(id).addEventListener("change", () => run(async () => {loadSchools();}));
$("new-school").addEventListener("click", () => {resetSchool(); controls(); $("school-name").focus();});
$("school-state").addEventListener("change", () => run(async () => {
  options("school-locality", [], "Select city/town");
  await localityOptions("school-locality", $("school-state").value, "Select city/town");
}));
$("school-form").addEventListener("submit", event => {
  event.preventDefault(); run(async () => {
    const input = {country: country(), level: level(), name: $("school-name").value, schoolCode: $("school-code").value,
      stateId: $("school-state").value, localityId: $("school-locality").value, streamId: $("school-stream").value || null, status: $("school-status").value};
    const saved = school ? await api.updateSchool({...input, id: school.id, expectedVersion: school.version}) : await api.createSchool(input);
    school = saved;
    $("editor-heading").textContent = "Edit school"; $("save-school").textContent = "Save school";
    message("School saved.");
    try {await fillSchool(saved); await loadSchools();} catch {message("School saved. The results could not refresh; reload the directory.", true);}
  });
});
$("archive-school").addEventListener("click", () => run(async () => {
  const saved = await api.archiveSchool({id: school.id, expectedVersion: school.version});
  school = saved; $("school-status").value = saved.status; message("School archived.");
  try {await fillSchool(saved); await loadSchools();} catch {message("School archived. Reload the directory to refresh results.", true);}
}));
$("state-record").addEventListener("change", () => run(async () => {
  const id = $("state-record").value;
  if (!id) {fillState(null); return;}
  state = null; stateLoadFailed = true;
  $("state-name").value = "";
  const record = await api.getState(id);
  if (!record) throw new Error("State unavailable. Reload the directory.");
  fillState(record);
}));
$("state-form").addEventListener("submit", event => {
  event.preventDefault(); run(async () => {
    const input = {country: country(), name: $("state-name").value, status: $("state-status").value};
    const saved = state ? await api.updateState({...input, id: state.id, expectedVersion: state.version}) : await api.createState(input);
    // Keep the returned version even if the following lookup refresh fails.
    fillState(saved);
    try {await refreshLocations(); fillState(saved); message("State saved.");}
    catch {message("State saved. Reload the directory to refresh locations.", true);}
  });
});
$("archive-state").addEventListener("click", () => run(async () => {
  const saved = await api.archiveState({id: state.id, expectedVersion: state.version});
  fillState(saved);
  try {await refreshLocations(); fillState(saved); message("State archived.");}
  catch {message("State archived. Reload the directory to refresh locations.", true);}
}));
$("locality-state").addEventListener("change", () => run(async () => {
  fillLocality(null); options("locality-record", [], "New city/town");
  await localityOptions("locality-record", $("locality-state").value, "New city/town");
}));
$("locality-record").addEventListener("change", () => run(async () => {
  const id = $("locality-record").value;
  if (!id) {fillLocality(null); return;}
  locality = null; localityLoadFailed = true;
  $("locality-name").value = "";
  const record = await api.getLocality(id);
  if (!record) throw new Error("City/town unavailable. Reload the directory.");
  fillLocality(record);
}));
$("locality-form").addEventListener("submit", event => {
  event.preventDefault(); run(async () => {
    const input = {country: country(), stateId: $("locality-state").value, name: $("locality-name").value,
      type: $("locality-type").value, status: $("locality-status").value};
    const saved = locality ? await api.updateLocality({...input, id: locality.id, expectedVersion: locality.version}) : await api.createLocality(input);
    fillLocality(saved);
    try {await refreshLocations(); fillLocality(saved); message("City/town saved.");}
    catch {message("City/town saved. Reload the directory to refresh locations.", true);}
  });
});
$("archive-locality").addEventListener("click", () => run(async () => {
  const saved = await api.archiveLocality({id: locality.id, expectedVersion: locality.version});
  fillLocality(saved);
  try {await refreshLocations(); fillLocality(saved); message("City/town archived.");}
  catch {message("City/town archived. Reload the directory to refresh locations.", true);}
}));

async function loadScopes() {
  scopes = await listSyllabusScopes();
  options("country", scopes.map(scope => ({id: scope.country, name: scope.country})), scopes.length ? "Select country" : "Add a country in Syllabus Scope Admin");
}
await run(async () => {
  await loadScopes();
  resetSchool(); message(scopes.length ? "Choose a country and level to begin." : "Add countries and levels in Syllabus Scope Admin first.");
});
