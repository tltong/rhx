import * as studentApi from "../../../student/student_profile_module.js?v=20261110-linked-student-edit-v1";
import * as schoolApi from "../../../school/school_module.js?v=20261109-schools-v1";
import {listSyllabusScopes} from "../../../syllabusscope/syllabusscope_module.js?v=20261104-fill-preassessment-v3";
import {resolveStudentCurrentGrade} from "../../../student/domain/student_summary.js?v=20261110-student-profile-v1";
import {createSearchableList} from "../../../searchable_list/searchable_list_module.js?v=20261110-autocomplete-v1";
import {createSchoolSearchProvider} from "../../../school/school_search_module.js?v=20261110-autocomplete-v1";

export function createLinkedStudentEditor({dialog, profiles = studentApi, schools = schoolApi,
  loadScopes = listSyllabusScopes, onSaved = async () => {}}) {
  const $ = id => dialog.querySelector("#" + id);
  let studentId, profile, busy = false, academic = false, scopes = [], selectedSchool = null;
  let pendingRequestId = null;
  const country = () => $("edit-student-country").value;
  const level = () => $("edit-student-level").value;
  const schoolPicker = createSearchableList({container: $("edit-school-picker"),
    loadItems: createSchoolSearchProvider({api: schools}), label: "School", placeholder: "Type a school name…", pageSize: 10,
    getItemLabel: school => school.name,
    getItemDescription: school => [school.localityName, school.stateName, !school.streamId ? "Stream not configured" : ""].filter(Boolean).join(" · "),
    onSelect: school => {selectedSchool = school; selection();},
  });
  function message(text, error = false) {
    $("student-edit-status").textContent = text;
    $("student-edit-status").hidden = !text;
    $("student-edit-status").classList.toggle("is-error", error);
  }
  function schoolMessage(text, error = false) {
    $("edit-school-status").textContent = text;
    $("edit-school-status").classList.toggle("is-error", error);
  }
  const pending = () => !!profile?.credentialChangePending || !!pendingRequestId;
  function controls() {
    dialog.querySelectorAll("button, input, select").forEach(element => {if (!element.closest("#edit-school-picker")) element.disabled = busy || !profile;});
    $("close-student-edit").disabled = busy;
    $("reload-student-edit").disabled = busy;
    $("edit-academic-fields").disabled = busy || !academic || !profile || pending();
    for (const id of ["save-student-details", "save-student-username", "save-student-pin", "edit-show-academic"]) {
      $(id).disabled = busy || !profile || pending();
    }
    $("check-student-username").hidden = !pending();
    $("edit-school-locality").disabled = busy || !$("edit-school-state").value;
    schoolPicker.setDisabled(busy || !profile || pending() || !academic || !country() || !level());
  }
  async function run(action, directory = false) {
    if (busy) return;
    busy = true; controls();
    try {await action();}
    catch (error) {
      const text = String(error.code || "").endsWith("aborted")
        ? "These details changed in another session. Reload the latest details before saving."
        : error.message || "The request could not finish. Reload the latest details and try again.";
      if (directory) schoolMessage(text, true); else message(text, true);
    } finally {busy = false; controls();}
  }
  function options(element, records, placeholder, selected = "") {
    element.replaceChildren(new Option(placeholder, ""));
    for (const record of records) element.add(new Option(record.name, String(record.id)));
    element.value = String(selected ?? "");
  }
  function grade() {
    try {return resolveStudentCurrentGrade(profile);} catch {return null;}
  }
  function fillProfile() {
    $("student-edit-heading").textContent = `Edit ${profile.name}`;
    $("edit-student-name").value = profile.name;
    $("edit-student-birth-year").value = profile.yearOfBirth;
    $("edit-student-username").value = profile.username;
    $("edit-student-academic-summary").textContent = `${profile.country} / ${profile.level} / ${grade() ? "Year " + grade() : "Grade needs updating"}`;
    $("student-pin-form").reset();
  }
  function resetAcademic() {
    academic = false; selectedSchool = null; schoolPicker.setSelection(null); schoolPicker.setDisabled(true);
    $("edit-academic-fields").hidden = true;
    $("edit-show-academic").setAttribute("aria-expanded", "false");
    $("edit-show-academic").textContent = "Change school or grade";
    $("edit-student-country").required = false;
    $("edit-student-level").required = false;
    $("edit-student-grade").required = false;
    schoolMessage("");
  }
  async function refreshProfile() {
    const saved = await profiles.getStudentProfile({studentId});
    if (!saved) throw new Error("This student is no longer available.");
    profile = saved; fillProfile(); resetAcademic();
  }
  async function refreshCards() {
    try {await onSaved(); return "";}
    catch {return " Reload the dashboard to refresh the student card.";}
  }
  async function lookup(method, input) {
    const items = [], seen = new Set(); let cursor;
    do {
      const page = await method({...input, limit: 100, ...(cursor ? {cursor} : {})});
      items.push(...page.items); cursor = page.nextCursor;
      if (cursor && seen.has(cursor)) throw new Error("The location list could not finish loading. Try again.");
      seen.add(cursor);
    } while (cursor);
    return items;
  }
  const scopeLevels = () => scopes.find(scope => scope.country === country())?.levels || {};
  function fillLevels(selected = "") {
    options($("edit-student-level"), Object.entries(scopeLevels())
      .filter(([, years]) => Object.values(years || {}).some(Boolean))
      .map(([id]) => ({id, name: id.charAt(0).toUpperCase() + id.slice(1)})), "Select level", selected);
  }
  function fillGrades(selected = "") {
    options($("edit-student-grade"), Object.entries(scopeLevels()[level()] || {})
      .filter(([value, enabled]) => enabled && Number(value) >= 1 && Number(value) <= 6)
      .map(([id]) => ({id, name: "Year " + id})), "Select grade", selected);
  }
  function selection() {
    $("edit-school-selection").textContent = selectedSchool
      ? `Selected school: ${selectedSchool.name}${selectedSchool.streamId ? "" : " — no stream assigned; choose another school."}`
      : "Select a school to change school or academic details.";
  }
  function filters() {
    return {country: country(), level: level(),
      ...($("edit-school-state").value ? {stateId: $("edit-school-state").value} : {}),
      ...($("edit-school-locality").value ? {localityId: $("edit-school-locality").value} : {})};
  }
  async function loadStates(selected = "") {
    options($("edit-school-state"), [], "All states");
    const states = country() ? await lookup(schools.listStates, {country: country()}) : [];
    options($("edit-school-state"), states, "All states", selected);
  }
  async function loadLocalities(selected = "") {
    const stateId = $("edit-school-state").value;
    options($("edit-school-locality"), [], "All cities/towns");
    const localities = stateId ? await lookup(schools.listLocalities, {country: country(), stateId}) : [];
    options($("edit-school-locality"), localities, "All cities/towns", selected);
  }
  async function showAcademic() {
    scopes = await loadScopes();
    // Scope repositories expose normalized levels, just as the school admin does.
    const currentSchool = profile.schoolId ? await schools.getSchool(profile.schoolId) : null;
    options($("edit-student-country"), scopes.map(scope => ({id: scope.country, name: scope.country})), "Select country", profile.country);
    fillLevels(profile.level); fillGrades(grade());
    await loadStates(currentSchool?.stateId); await loadLocalities(currentSchool?.localityId);
    selectedSchool = currentSchool; schoolPicker.setSelection(currentSchool); selection();
    academic = true; $("edit-academic-fields").hidden = false;
    for (const id of ["edit-student-country", "edit-student-level", "edit-student-grade"]) $(id).required = true;
    $("edit-show-academic").setAttribute("aria-expanded", "true");
    $("edit-show-academic").textContent = "Cancel school and grade changes";
    schoolPicker.setFilters(filters()); schoolMessage("");
  }
  async function handleOperation(operation) {
    if (operation?.status === "completed") {
      pendingRequestId = null;
      await refreshProfile();
      message("Username changed." + await refreshCards());
    } else if (operation?.status === "failed") {
      pendingRequestId = null; await refreshProfile();
      message("The username was not changed. Choose an available username and try again.", true);
    } else if (operation) {
      pendingRequestId = operation.requestId;
      profile.credentialChangePending = true;
      message(operation.status === "blocked" ? "This username change needs help from an administrator." : "The username change is still finishing. Check its status in a moment.", operation.status === "blocked");
    } else {
      pendingRequestId = null; await refreshProfile();
      message("Latest student details loaded.");
    }
  }
  $("close-student-edit").addEventListener("click", () => dialog.close());
  dialog.addEventListener("cancel", event => {if (busy) event.preventDefault();});
  dialog.addEventListener("close", () => {
    $("student-pin-form").reset(); $("student-username-form").reset();
    profile = null; pendingRequestId = null; resetAcademic();
  });
  $("reload-student-edit").addEventListener("click", () => run(async () => {
    pendingRequestId = null; await refreshProfile();
    if (profile.credentialChangePending) await handleOperation(await profiles.getStudentCredentialChange({studentId}));
    else message("Latest student details loaded.");
  }));
  $("edit-show-academic").addEventListener("click", () => run(async () => {
    if (!academic) await showAcademic();
    else {resetAcademic(); message("School and grade changes discarded.");}
  }, true));
  $("edit-student-country").addEventListener("change", () => run(async () => {
    selectedSchool = null; schoolPicker.setSelection(null); selection(); fillLevels(); fillGrades();
    options($("edit-school-locality"), [], "All cities/towns");
    try {await loadStates(); await loadLocalities(); schoolMessage("Choose a level and grade, then search for a school.");}
    finally {schoolPicker.setFilters(filters());}
  }, true));
  $("edit-student-level").addEventListener("change", () => run(async () => {
    selectedSchool = null; schoolPicker.setSelection(null); selection(); fillGrades(); schoolPicker.setFilters(filters());
  }, true));
  $("edit-school-state").addEventListener("change", () => run(async () => {
    try {await loadLocalities();} finally {schoolPicker.setFilters(filters());}
  }, true));
  $("edit-school-locality").addEventListener("change", () => schoolPicker.setFilters(filters()));
  $("student-details-form").addEventListener("submit", event => {
    event.preventDefault(); if (!event.currentTarget.reportValidity()) return;
    void run(async () => {
      const changes = {}, name = $("edit-student-name").value.trim(), birth = Number($("edit-student-birth-year").value);
      if (name !== profile.name) changes.name = name;
      if (birth !== profile.yearOfBirth) changes.yearOfBirth = birth;
      if (academic) {
        if (!selectedSchool && schoolPicker.getQuery().trim()) throw new Error("Choose a school from the suggestions before saving.");
        if (country() !== profile.country) changes.country = country();
        if (level() !== profile.level) changes.level = level();
        if (Number($("edit-student-grade").value) !== grade()) changes.currentGrade = Number($("edit-student-grade").value);
        if (selectedSchool?.id && selectedSchool.id !== profile.schoolId) changes.schoolId = selectedSchool.id;
        const changedAcademics = ["country", "level", "currentGrade", "schoolId"].some(key => key in changes);
        if (changedAcademics && !selectedSchool?.streamId) throw new Error("Choose a school with an assigned stream before saving academic changes.");
      }
      if (!Object.keys(changes).length) {message("No changes to save."); return;}
      profile = await profiles.updateStudentProfile({studentId, expectedVersion: profile.profileVersion, changes});
      fillProfile(); resetAcademic(); message("Student details saved." + await refreshCards());
    });
  });
  $("student-username-form").addEventListener("submit", event => {
    event.preventDefault(); if (!event.currentTarget.reportValidity()) return;
    void run(async () => {
      const username = $("edit-student-username").value.trim().toLowerCase();
      if (username === profile.username) {message("This is already the student's username."); return;}
      pendingRequestId = crypto.randomUUID();
      let operation;
      try {operation = await profiles.changeStudentUsername({studentId, expectedVersion: profile.profileVersion, username, requestId: pendingRequestId});}
      catch (error) {
        try {operation = await profiles.getStudentCredentialChange({studentId, requestId: pendingRequestId});}
        catch (statusError) {
          if (String(statusError.code || "").endsWith("not-found")) pendingRequestId = null;
          throw error;
        }
      }
      await handleOperation(operation);
    });
  });
  $("check-student-username").addEventListener("click", () => run(async () => {
    const operation = await profiles.getStudentCredentialChange({studentId, ...(pendingRequestId ? {requestId: pendingRequestId} : {})});
    await handleOperation(operation);
  }));
  $("student-pin-form").addEventListener("submit", event => {
    event.preventDefault(); if (!event.currentTarget.reportValidity()) return;
    void run(async () => {
      const newPin = $("edit-student-pin").value;
      if (newPin !== $("edit-student-pin-confirm").value) throw new Error("The new PINs do not match.");
      await profiles.resetStudentPin({studentId, expectedVersion: profile.profileVersion, newPin});
      $("student-pin-form").reset(); message("Student PIN changed.");
    });
  });
  $("edit-student-birth-year").max = String(new Date().getUTCFullYear());
  resetAcademic(); controls();
  return {async open(id) {
    if (dialog.open || busy) return;
    studentId = id; profile = null; pendingRequestId = null;
    $("student-details-form").reset(); $("student-username-form").reset(); $("student-pin-form").reset();
    message("Loading student details..."); dialog.showModal();
    await run(async () => {
      await refreshProfile(); message("");
      if (profile.credentialChangePending) await handleOperation(await profiles.getStudentCredentialChange({studentId}));
    });
    if (profile && !pending()) $("edit-student-name").focus();
  }};
}
