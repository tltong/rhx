import {
  listStudents
} from "../../../student/student_module.js?v=20260716-no-eager-auth";

import {
  listSyllabuses
} from "../../../syllabus/syllabus_module.js?v=20260716-no-eager-auth";

import {
  activateSyllabus,
  deactivateSyllabus,
  getStudentSyllabusSubscription,
  listStudentSyllabusSubscriptions,
  subscribeSyllabus,
  unsubscribeSyllabus
} from "../../syllabus_subscription_module.js?v=20260716-no-eager-auth";

const studentsContainer = document.querySelector("#students-container");
const syllabusesContainer = document.querySelector("#syllabuses-container");
const selectedStudentOutput = document.querySelector("#selected-student");
const selectedSyllabusOutput = document.querySelector("#selected-syllabus");
const selectedStateOutput = document.querySelector("#selected-state");
const subscribeButton = document.querySelector("#subscribe-syllabus");
const unsubscribeButton = document.querySelector("#unsubscribe-syllabus");
const activateButton = document.querySelector("#activate-syllabus");
const deactivateButton = document.querySelector("#deactivate-syllabus");
const statusMessage = document.querySelector("#status-message");

let students = [];
let syllabuses = [];
let selectedStudentId = "";
let selectedSyllabusId = "";
let selectedSubscription = null;
let selectedStudentSubscriptions = [];
let pageBusy = false;

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

function getStudentLabel(studentId) {
  const student = students.find((item) => item.id === studentId);

  if (!student) {
    return "Not selected";
  }

  return student.name || student.username || student.id;
}

function getSyllabusLabel(syllabusId) {
  const syllabus = syllabuses.find((item) => item.id === syllabusId);

  if (!syllabus) {
    return "Not selected";
  }

  return [
    syllabus.country,
    syllabus.level,
    `Year ${syllabus.year}`,
    syllabus.subject
  ].join(" / ");
}

function getSubscriptionForSyllabus(syllabusId) {
  return selectedStudentSubscriptions.find(
    (subscription) => subscription.syllabusId === syllabusId
  ) || null;
}

function setBusy(isBusy) {
  pageBusy = isBusy;

  studentsContainer
    .querySelectorAll("input[type='checkbox']")
    .forEach((checkbox) => {
      checkbox.disabled = isBusy;
    });
  syllabusesContainer
    .querySelectorAll("input[type='checkbox']")
    .forEach((checkbox) => {
      checkbox.disabled = isBusy;
    });

  updateActionButtons();
}

function updateSelectedOutputs() {
  selectedStudentOutput.textContent = getStudentLabel(selectedStudentId);
  selectedSyllabusOutput.textContent = getSyllabusLabel(selectedSyllabusId);
  selectedStateOutput.textContent = selectedSubscription?.state || "Not subscribed";
}

function updateActionButtons() {
  const hasSelection = Boolean(selectedStudentId && selectedSyllabusId);
  const hasSubscription = Boolean(selectedSubscription);

  subscribeButton.disabled = pageBusy || !hasSelection;
  activateButton.disabled = pageBusy || !hasSelection;
  deactivateButton.disabled = pageBusy || !hasSelection;
  unsubscribeButton.disabled = pageBusy || !hasSelection || !hasSubscription;
}

function updateSyllabusSubscriptionBadges() {
  syllabusesContainer.querySelectorAll(".option-item").forEach((item) => {
    const subscription = getSubscriptionForSyllabus(item.dataset.syllabusId);
    const badge = item.querySelector(".state-pill");

    badge.textContent = subscription?.state || "none";
    badge.classList.toggle("active", subscription?.state === "active");
    badge.classList.toggle("inactive", subscription?.state === "inactive");
  });
}

function renderStudents() {
  studentsContainer.replaceChildren();

  if (students.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = "No students found.";
    studentsContainer.append(empty);
    return;
  }

  students.forEach((student) => {
    const label = document.createElement("label");
    label.className = "option-item";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = student.id;
    checkbox.checked = student.id === selectedStudentId;
    checkbox.disabled = pageBusy;

    const main = document.createElement("span");
    main.className = "option-main";

    const title = document.createElement("span");
    title.className = "option-title";
    title.textContent = student.name || student.username || student.id;

    const detail = document.createElement("span");
    detail.className = "option-detail";
    detail.textContent = [
      student.username,
      student.level,
      student.standardAtYearOfRegistration
        ? `Standard ${student.standardAtYearOfRegistration}`
        : ""
    ].filter(Boolean).join(" / ");

    main.append(title, detail);
    label.append(checkbox, main);
    studentsContainer.append(label);

    checkbox.addEventListener("change", async () => {
      selectedStudentId = checkbox.checked ? student.id : "";
      selectedSubscription = null;
      await refreshSelectedStudentSubscriptions();
      renderStudents();
      renderSyllabuses();
      await refreshSelectedSubscription();
    });
  });
}

function renderSyllabuses() {
  syllabusesContainer.replaceChildren();

  if (syllabuses.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = "No syllabuses found.";
    syllabusesContainer.append(empty);
    return;
  }

  syllabuses.forEach((syllabus) => {
    const label = document.createElement("label");
    label.className = "option-item";
    label.dataset.syllabusId = syllabus.id;

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = syllabus.id;
    checkbox.checked = syllabus.id === selectedSyllabusId;
    checkbox.disabled = pageBusy;

    const main = document.createElement("span");
    main.className = "option-main";

    const title = document.createElement("span");
    title.className = "option-title";
    title.textContent = syllabus.subject;

    const detail = document.createElement("span");
    detail.className = "option-detail";
    detail.textContent = [
      syllabus.country,
      syllabus.level,
      `Year ${syllabus.year}`,
      syllabus.active ? "active syllabus" : "inactive syllabus"
    ].join(" / ");

    const badge = document.createElement("span");
    badge.className = "state-pill";

    main.append(title, detail);
    label.append(checkbox, main, badge);
    syllabusesContainer.append(label);

    checkbox.addEventListener("change", async () => {
      selectedSyllabusId = checkbox.checked ? syllabus.id : "";
      await refreshSelectedSubscription();
      renderSyllabuses();
    });
  });

  updateSyllabusSubscriptionBadges();
}

async function refreshSelectedStudentSubscriptions() {
  if (!selectedStudentId) {
    selectedStudentSubscriptions = [];
    return;
  }

  selectedStudentSubscriptions = await listStudentSyllabusSubscriptions(
    selectedStudentId
  );
}

async function refreshSelectedSubscription() {
  if (!selectedStudentId || !selectedSyllabusId) {
    selectedSubscription = null;
    updateSelectedOutputs();
    updateActionButtons();
    updateSyllabusSubscriptionBadges();
    return;
  }

  selectedSubscription = await getStudentSyllabusSubscription(
    selectedStudentId,
    selectedSyllabusId
  );
  await refreshSelectedStudentSubscriptions();
  updateSelectedOutputs();
  updateActionButtons();
  updateSyllabusSubscriptionBadges();
}

async function runSubscriptionAction(actionName, action) {
  if (!selectedStudentId || !selectedSyllabusId) {
    setStatus("Select one student and one syllabus first.", true);
    return;
  }

  setBusy(true);
  clearStatus();

  try {
    await action(selectedStudentId, selectedSyllabusId);
    await refreshSelectedSubscription();
    renderSyllabuses();
    setStatus(`${actionName} complete.`);
  } catch (error) {
    setStatus(error.message || `${actionName} failed.`, true);
  } finally {
    setBusy(false);
  }
}

async function initPage() {
  setBusy(true);

  try {
    students = await listStudents();
    syllabuses = await listSyllabuses();
    renderStudents();
    renderSyllabuses();
    updateSelectedOutputs();
    updateActionButtons();
    setStatus("Select one student and one syllabus.");
  } catch (error) {
    setStatus(error.message || "Could not load subscription admin data.", true);
  } finally {
    setBusy(false);
  }
}

subscribeButton.addEventListener("click", () => {
  runSubscriptionAction("Subscribe", subscribeSyllabus);
});
unsubscribeButton.addEventListener("click", () => {
  runSubscriptionAction("Unsubscribe", unsubscribeSyllabus);
});
activateButton.addEventListener("click", () => {
  runSubscriptionAction("Activate", activateSyllabus);
});
deactivateButton.addEventListener("click", () => {
  runSubscriptionAction("Deactivate", deactivateSyllabus);
});

initPage();
