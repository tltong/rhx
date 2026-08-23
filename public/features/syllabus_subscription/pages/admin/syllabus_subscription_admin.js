import {
  listStudents
} from "../../../student/student_module.js?v=20260823-student-country-v1";

import {
  getSyllabusById
} from "../../../syllabus/syllabus_module.js?v=20260823-student-availability-page-v1";

import {
  activateSyllabus,
  deactivateSyllabus,
  listAvailableSyllabusesForStudent,
  listStudentSyllabusSubscriptions,
  subscribeSyllabus,
  unsubscribeSyllabus
} from "../../syllabus_subscription_module.js?v=20260823-student-availability-page-v1";

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
const subscribeAllButton = document.querySelector(
  "#subscribe-all-syllabuses"
);
const unsubscribeButton = document.querySelector("#unsubscribe-syllabus");
const activateButton = document.querySelector("#activate-syllabus");
const deactivateButton = document.querySelector("#deactivate-syllabus");
const statusMessage = document.querySelector("#status-message");

let students = [];
let availableSyllabuses = [];
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

function getAvailableSyllabus(syllabusId) {
  return availableSyllabuses.find((item) => item.id === syllabusId) || null;
}

function getSyllabusLabel(syllabusId) {
  const availableSyllabus = getAvailableSyllabus(syllabusId);

  if (!availableSyllabus) {
    return syllabusId || "Not selected";
  }

  const syllabus = availableSyllabus.syllabus;

  return [
    syllabus?.subject || availableSyllabus.id,
    availableSyllabus.language
  ].filter(Boolean).join(" / ");
}

function getSelectedSyllabusLanguages() {
  const availableLanguage = getAvailableSyllabus(
    selectedSyllabusId
  )?.language;

  if (availableLanguage) {
    return [availableLanguage];
  }

  return selectedSubscription?.language
    ? [selectedSubscription.language]
    : [];
}

function getSubscriptionForSyllabus(syllabusId) {
  return selectedStudentSubscriptions.find(
    (subscription) => subscription.syllabusId === syllabusId
  ) || null;
}

function normalizeLanguageKey(language) {
  return String(language || "").trim().toLowerCase();
}

function getPendingBulkSubscriptions() {
  return availableSyllabuses.filter((availableSyllabus) => {
    const subscription = getSubscriptionForSyllabus(availableSyllabus.id);

    return !subscription
      || subscription.state !== "active"
      || normalizeLanguageKey(subscription.language)
        !== normalizeLanguageKey(availableSyllabus.language);
  });
}

function clearSelectedStudentData() {
  availableSyllabuses = [];
  selectedSyllabusId = "";
  selectedLanguage = "";
  selectedSubscription = null;
  selectedStudentSubscriptions = [];
  selectedStudentActiveSubscriptions = [];
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

  selectedLanguage = languages[0] || "";
  subscriptionLanguageSelect.replaceChildren();

  if (languages.length === 0) {
    const placeholder = document.createElement("option");

    placeholder.value = "";
    placeholder.textContent = "Select a syllabus";
    subscriptionLanguageSelect.append(placeholder);
  } else {
    languages.forEach((language) => {
      const option = document.createElement("option");

      option.value = language;
      option.textContent = language;
      subscriptionLanguageSelect.append(option);
    });
  }

  subscriptionLanguageSelect.value = selectedLanguage;
}

function updateSelectedOutputs() {
  selectedStudentOutput.textContent = getStudentLabel(selectedStudentId);
  selectedSyllabusOutput.textContent = getSyllabusLabel(selectedSyllabusId);
  selectedStateOutput.textContent = selectedSubscription?.state
    || "Not subscribed";
}

function updateActionButtons() {
  const hasSelection = Boolean(selectedStudentId && selectedSyllabusId);
  const isAvailable = Boolean(getAvailableSyllabus(selectedSyllabusId));
  const hasSubscription = Boolean(selectedSubscription);
  const isActive = selectedSubscription?.state === "active";
  const isInactive = selectedSubscription?.state === "inactive";
  const hasLanguage = Boolean(selectedLanguage);
  const pendingBulkSubscriptions = getPendingBulkSubscriptions();

  subscriptionLanguageSelect.disabled = true;
  subscribeAllButton.textContent = pendingBulkSubscriptions.length > 0
    ? "Subscribe All (" + pendingBulkSubscriptions.length + ")"
    : "Subscribe All";
  subscribeAllButton.disabled = pageBusy
    || !selectedStudentId
    || pendingBulkSubscriptions.length === 0;
  subscribeButton.disabled = pageBusy
    || !hasSelection
    || !isAvailable
    || !hasLanguage
    || hasSubscription;
  activateButton.disabled = pageBusy
    || !hasSelection
    || !isAvailable
    || !hasLanguage
    || !isInactive;
  deactivateButton.disabled = pageBusy
    || !hasSelection
    || !hasLanguage
    || !isActive;
  unsubscribeButton.disabled = pageBusy
    || !hasSelection
    || !hasSubscription;
}

function updateSyllabusSubscriptionBadges() {
  syllabusesContainer.querySelectorAll(".option-item").forEach((item) => {
    const subscription = getSubscriptionForSyllabus(item.dataset.syllabusId);
    const badge = item.querySelector(".state-pill");

    badge.textContent = subscription?.state || "available";
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
    const availableSyllabus = getAvailableSyllabus(subscription.syllabusId);
    const syllabus = availableSyllabus?.syllabus;
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
      : [subscription.syllabusId, subscription.language]
        .filter(Boolean).join(" / ");

    button.append(title, detail);
    activeSubscriptionsContainer.append(button);

    button.addEventListener("click", () => {
      selectedSyllabusId = subscription.syllabusId;
      selectedSubscription = subscription;
      selectedLanguage = availableSyllabus?.language
        || subscription.language
        || "";
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
      student.country,
      student.level,
      student.standardAtYearOfRegistration
        ? `Registered in Year ${student.standardAtYearOfRegistration}`
        : ""
    ].filter(Boolean).join(" / ");

    main.append(title, detail);
    label.append(checkbox, main);
    studentsContainer.append(label);

    checkbox.addEventListener("change", async () => {
      selectedStudentId = checkbox.checked ? student.id : "";
      clearSelectedStudentData();
      renderStudents();
      renderSyllabuses();
      renderActiveSubscriptions();
      renderLanguageOptions();
      updateSelectedOutputs();
      setBusy(true);
      clearStatus();

      try {
        await refreshSelectedStudentData();
        renderStudents();
        renderSyllabuses();
        renderActiveSubscriptions();
        renderLanguageOptions();
        updateSelectedOutputs();
        updateActionButtons();
        setStatus(
          selectedStudentId
            ? `${availableSyllabuses.length} syllabus option${availableSyllabuses.length === 1 ? "" : "s"} available; ${selectedStudentActiveSubscriptions.length} active subscription${selectedStudentActiveSubscriptions.length === 1 ? "" : "s"}.`
            : "Select a student to load available syllabuses."
        );
      } catch (error) {
        clearSelectedStudentData();
        renderSyllabuses();
        renderActiveSubscriptions();
        renderLanguageOptions();
        updateSelectedOutputs();
        setStatus(
          error.message || "Could not load available syllabuses.",
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

  if (!selectedStudentId) {
    const empty = document.createElement("p");

    empty.className = "empty-message";
    empty.textContent = "Select a student to load available syllabuses.";
    syllabusesContainer.append(empty);
    return;
  }

  if (availableSyllabuses.length === 0) {
    const empty = document.createElement("p");

    empty.className = "empty-message";
    empty.textContent =
      "No syllabuses are available for this student's stream and current year.";
    syllabusesContainer.append(empty);
    return;
  }

  availableSyllabuses.forEach((availableSyllabus) => {
    const syllabus = availableSyllabus.syllabus;
    const label = document.createElement("label");
    label.className = "option-item";
    label.dataset.syllabusId = availableSyllabus.id;

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = availableSyllabus.id;
    checkbox.checked = availableSyllabus.id === selectedSyllabusId;
    checkbox.disabled = pageBusy;

    const main = document.createElement("span");
    main.className = "option-main";

    const title = document.createElement("span");
    title.className = "option-title";
    title.textContent = syllabus?.subject || availableSyllabus.id;

    const detail = document.createElement("span");
    detail.className = "option-detail";
    detail.textContent = syllabus
      ? [
        syllabus.country,
        syllabus.level,
        `Year ${syllabus.year}`,
        availableSyllabus.language
      ].filter(Boolean).join(" / ")
      : [availableSyllabus.id, availableSyllabus.language]
        .filter(Boolean).join(" / ");

    const badge = document.createElement("span");
    badge.className = "state-pill";

    main.append(title, detail);
    label.append(checkbox, main, badge);
    syllabusesContainer.append(label);

    checkbox.addEventListener("change", () => {
      selectedSyllabusId = checkbox.checked ? availableSyllabus.id : "";
      selectedSubscription = selectedSyllabusId
        ? getSubscriptionForSyllabus(selectedSyllabusId)
        : null;
      selectedLanguage = selectedSyllabusId
        ? availableSyllabus.language
        : "";
      renderSyllabuses();
      renderActiveSubscriptions();
      renderLanguageOptions();
      updateSelectedOutputs();
      updateActionButtons();
      clearStatus();
    });
  });

  updateSyllabusSubscriptionBadges();
}

async function refreshSelectedStudentData() {
  if (!selectedStudentId) {
    clearSelectedStudentData();
    return;
  }

  const [availability, subscriptions] = await Promise.all([
    listAvailableSyllabusesForStudent(selectedStudentId),
    listStudentSyllabusSubscriptions(selectedStudentId)
  ]);
  const syllabusEntries = await Promise.all(availability.map(async ({
    syllabusId,
    language
  }) => ({
    id: syllabusId,
    language,
    syllabus: await getSyllabusById(syllabusId)
  })));

  availableSyllabuses = syllabusEntries;
  selectedStudentSubscriptions = subscriptions;
  selectedStudentActiveSubscriptions = subscriptions.filter(
    (subscription) => subscription.state === "active"
  );
}

async function refreshSelectedSubscription() {
  await refreshSelectedStudentData();
  selectedSubscription = selectedSyllabusId
    ? getSubscriptionForSyllabus(selectedSyllabusId)
    : null;
  selectedLanguage = getAvailableSyllabus(selectedSyllabusId)?.language
    || selectedSubscription?.language
    || "";
  renderLanguageOptions();
  updateSelectedOutputs();
  updateActionButtons();
  updateSyllabusSubscriptionBadges();
  renderActiveSubscriptions();
}

async function subscribeAllAvailableSyllabuses() {
  if (!selectedStudentId) {
    setStatus("Select a student first.", true);
    return;
  }

  const targets = getPendingBulkSubscriptions();

  if (targets.length === 0) {
    setStatus("All available syllabuses are already subscribed.");
    return;
  }

  setBusy(true);
  clearStatus();

  try {
    const results = await Promise.allSettled(targets.map((target) => (
      subscribeSyllabus(
        selectedStudentId,
        target.id,
        target.language
      )
    )));
    const failures = results.filter((result) => result.status === "rejected");

    await refreshSelectedSubscription();
    renderSyllabuses();

    if (failures.length > 0) {
      const firstError = failures[0].reason?.message || "Unknown error.";
      const successCount = targets.length - failures.length;

      setStatus(
        successCount
          + " syllabus subscription"
          + (successCount === 1 ? "" : "s")
          + " completed; "
          + failures.length
          + " failed. "
          + firstError,
        true
      );
      return;
    }

    setStatus(
      targets.length
        + " syllabus subscription"
        + (targets.length === 1 ? "" : "s")
        + " completed."
    );
  } catch (error) {
    setStatus(error.message || "Subscribe all failed.", true);
  } finally {
    setBusy(false);
  }
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
    setStatus("The selected syllabus has no stream language.", true);
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
    renderStudents();
    renderSyllabuses();
    renderActiveSubscriptions();
    renderLanguageOptions();
    updateSelectedOutputs();
    updateActionButtons();
    setStatus("Select a student to load available syllabuses.");
  } catch (error) {
    setStatus(error.message || "Could not load students.", true);
  } finally {
    setBusy(false);
  }
}

subscribeAllButton.addEventListener("click", () => {
  subscribeAllAvailableSyllabuses();
});
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

initPage();
