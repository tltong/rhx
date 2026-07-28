import {
  listStudents
} from "../../../student/student_module.js?v=20260716-no-eager-auth";

import {
  listSyllabuses
} from "../../../syllabus/syllabus_module.js?v=20260726-subscription-language";

import {
  activateSyllabus,
  deactivateSyllabus,
  getStudentSyllabusSubscription,
  listActiveStudentSyllabusSubscriptions,
  listStudentSyllabusSubscriptions,
  subscribeSyllabus,
  unsubscribeSyllabus
} from "../../syllabus_subscription_module.js?v=20260726-subscription-language";

const studentsContainer = document.querySelector("#students-container");
const syllabusesContainer = document.querySelector("#syllabuses-container");
const activeSubscriptionsContainer = document.querySelector(
  "#active-subscriptions-container"
);
const activeSubscriptionCount = document.querySelector(
  "#active-subscription-count"
);
const selectedStudentOutput = document.querySelector("#selected-student");
const selectedSyllabusOutput = document.querySelector("#selected-syllabus");
const selectedStateOutput = document.querySelector("#selected-state");
const subscriptionLanguageSelect = document.querySelector(
  "#subscription-language"
);
const subscribeButton = document.querySelector("#subscribe-syllabus");
const unsubscribeButton = document.querySelector("#unsubscribe-syllabus");
const activateButton = document.querySelector("#activate-syllabus");
const deactivateButton = document.querySelector("#deactivate-syllabus");
const statusMessage = document.querySelector("#status-message");

let students = [];
let syllabuses = [];
let selectedStudentId = "";
let selectedSyllabusId = "";
let selectedLanguage = "";
let selectedSubscription = null;
let selectedStudentSubscriptions = [];
let selectedStudentActiveSubscriptions = [];
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

function getSelectedSyllabus() {
  return syllabuses.find(
    (syllabus) => syllabus.id === selectedSyllabusId
  ) || null;
}

function getSelectedSyllabusLanguages() {
  const syllabus = getSelectedSyllabus();

  if (!syllabus || !Array.isArray(syllabus.languages)) {
    return [];
  }

  const languages = [];
  const languageKeys = new Set();

  syllabus.languages.forEach((language) => {
    const normalizedLanguage = String(language || "").trim();
    const languageKey = normalizedLanguage.toLowerCase();

    if (normalizedLanguage && !languageKeys.has(languageKey)) {
      languageKeys.add(languageKey);
      languages.push(normalizedLanguage);
    }
  });

  return languages;
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
  activeSubscriptionsContainer
    .querySelectorAll("button")
    .forEach((button) => {
      button.disabled = isBusy;
    });

  updateActionButtons();
}

function renderLanguageOptions() {
  const languages = getSelectedSyllabusLanguages();
  const storedLanguage = selectedSubscription?.language || "";
  const matchingLanguage = languages.find(
    (language) =>
      language.toLowerCase() === selectedLanguage.toLowerCase()
  );
  const matchingStoredLanguage = languages.find(
    (language) =>
      language.toLowerCase() === storedLanguage.toLowerCase()
  );

  selectedLanguage = matchingLanguage || matchingStoredLanguage || "";
  subscriptionLanguageSelect.replaceChildren();

  const placeholder = document.createElement("option");

  placeholder.value = "";
  placeholder.textContent = languages.length > 0
    ? "Select language"
    : "No languages configured";
  subscriptionLanguageSelect.append(placeholder);

  languages.forEach((language) => {
    const option = document.createElement("option");

    option.value = language;
    option.textContent = language;
    subscriptionLanguageSelect.append(option);
  });

  subscriptionLanguageSelect.value = selectedLanguage;
}

function updateSelectedOutputs() {
  selectedStudentOutput.textContent = getStudentLabel(selectedStudentId);
  selectedSyllabusOutput.textContent = getSyllabusLabel(selectedSyllabusId);
  selectedStateOutput.textContent = selectedSubscription?.state || "Not subscribed";
}

function updateActionButtons() {
  const hasSelection = Boolean(selectedStudentId && selectedSyllabusId);
  const hasSubscription = Boolean(selectedSubscription);
  const hasLanguage = Boolean(selectedLanguage);
  const hasAvailableLanguages = getSelectedSyllabusLanguages().length > 0;

  subscriptionLanguageSelect.disabled =
    pageBusy || !hasSelection || !hasAvailableLanguages;
  subscribeButton.disabled = pageBusy || !hasSelection || !hasLanguage;
  activateButton.disabled = pageBusy || !hasSelection || !hasLanguage;
  deactivateButton.disabled = pageBusy || !hasSelection || !hasLanguage;
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

function renderActiveSubscriptions() {
  activeSubscriptionsContainer.replaceChildren();

  if (!selectedStudentId) {
    const empty = document.createElement("p");

    empty.className = "empty-message";
    empty.textContent = "Select a student to view active subscriptions.";
    activeSubscriptionsContainer.append(empty);
    activeSubscriptionCount.textContent = "Select a student";
    return;
  }

  activeSubscriptionCount.textContent =
    `${selectedStudentActiveSubscriptions.length} active`;

  if (selectedStudentActiveSubscriptions.length === 0) {
    const empty = document.createElement("p");

    empty.className = "empty-message";
    empty.textContent = "This student has no active syllabus subscriptions.";
    activeSubscriptionsContainer.append(empty);
    return;
  }

  selectedStudentActiveSubscriptions.forEach((subscription) => {
    const syllabus = syllabuses.find(
      (item) => item.id === subscription.syllabusId
    );
    const button = document.createElement("button");
    const title = document.createElement("span");
    const detail = document.createElement("span");

    button.type = "button";
    button.className = "active-subscription-item";
    button.classList.toggle(
      "selected",
      subscription.syllabusId === selectedSyllabusId
    );
    button.disabled = pageBusy;
    title.className = "option-title";
    title.textContent = syllabus?.subject || subscription.syllabusId;
    detail.className = "option-detail";
    detail.textContent = syllabus
      ? [
        syllabus.country,
        syllabus.level,
        `Year ${syllabus.year}`,
        subscription.language
      ].filter(Boolean).join(" / ")
      : subscription.syllabusId;

    button.append(title, detail);
    activeSubscriptionsContainer.append(button);

    button.addEventListener("click", () => {
      selectedSyllabusId = subscription.syllabusId;
      selectedSubscription = subscription;
      selectedLanguage = subscription.language || "";
      renderSyllabuses();
      renderActiveSubscriptions();
      renderLanguageOptions();
      updateSelectedOutputs();
      updateActionButtons();
      setStatus("Active subscription selected.");
    });
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
      setBusy(true);
      clearStatus();

      try {
        await refreshSelectedStudentSubscriptions();
        selectedSubscription = selectedSyllabusId
          ? getSubscriptionForSyllabus(selectedSyllabusId)
          : null;
        selectedLanguage = selectedSubscription?.language || "";
        renderStudents();
        renderSyllabuses();
        renderActiveSubscriptions();
        renderLanguageOptions();
        updateSelectedOutputs();
        updateActionButtons();
        setStatus(
          selectedStudentId
            ? `${selectedStudentActiveSubscriptions.length} active subscription${selectedStudentActiveSubscriptions.length === 1 ? "" : "s"} loaded.`
            : "Select one student and one syllabus."
        );
      } catch (error) {
        setStatus(
          error.message || "Could not load student subscriptions.",
          true
        );
      } finally {
        setBusy(false);
      }
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
      selectedLanguage = "";
      await refreshSelectedSubscription();
      renderSyllabuses();
    });
  });

  updateSyllabusSubscriptionBadges();
}

async function refreshSelectedStudentSubscriptions() {
  if (!selectedStudentId) {
    selectedStudentSubscriptions = [];
    selectedStudentActiveSubscriptions = [];
    return;
  }

  [
    selectedStudentSubscriptions,
    selectedStudentActiveSubscriptions
  ] = await Promise.all([
    listStudentSyllabusSubscriptions(selectedStudentId),
    listActiveStudentSyllabusSubscriptions(selectedStudentId)
  ]);
}

async function refreshSelectedSubscription() {
  if (!selectedStudentId || !selectedSyllabusId) {
    selectedSubscription = null;
    selectedLanguage = "";
    renderLanguageOptions();
    updateSelectedOutputs();
    updateActionButtons();
    updateSyllabusSubscriptionBadges();
    renderActiveSubscriptions();
    return;
  }

  selectedSubscription = await getStudentSyllabusSubscription(
    selectedStudentId,
    selectedSyllabusId
  );
  selectedLanguage = selectedSubscription?.language || "";
  await refreshSelectedStudentSubscriptions();
  renderLanguageOptions();
  updateSelectedOutputs();
  updateActionButtons();
  updateSyllabusSubscriptionBadges();
  renderActiveSubscriptions();
}

async function runSubscriptionAction(
  actionName,
  action,
  requiresLanguage = true
) {
  if (!selectedStudentId || !selectedSyllabusId) {
    setStatus("Select one student and one syllabus first.", true);
    return;
  }

  if (requiresLanguage && !selectedLanguage) {
    setStatus("Select a language first.", true);
    return;
  }

  setBusy(true);
  clearStatus();

  try {
    await action(
      selectedStudentId,
      selectedSyllabusId,
      selectedLanguage
    );
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
    renderActiveSubscriptions();
    renderLanguageOptions();
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
  runSubscriptionAction("Unsubscribe", unsubscribeSyllabus, false);
});
activateButton.addEventListener("click", () => {
  runSubscriptionAction("Activate", activateSyllabus);
});
deactivateButton.addEventListener("click", () => {
  runSubscriptionAction("Deactivate", deactivateSyllabus);
});

subscriptionLanguageSelect.addEventListener("change", () => {
  selectedLanguage = subscriptionLanguageSelect.value;
  updateActionButtons();
  clearStatus();
});

initPage();
