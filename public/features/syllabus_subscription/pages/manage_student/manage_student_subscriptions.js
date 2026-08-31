import {
  getGuardianById,
  onGuardianAuthStateChanged
} from "../../../guardian/guardian_module.js?v=20260827-guardian-access-v1";
import {
  getGuardianStudentLink,
  guardianStudentLinkStates
} from "../../../guardian_student_link/guardian_student_link_module.js?v=20260827-guardian-access-v1";
import {
  getSyllabusById
} from "../../../syllabus/syllabus_module.js?v=20260827-student-subscriptions-v1";
import {
  activateSyllabus,
  deactivateSyllabus,
  listAvailableSyllabusesForStudent,
  listStudentSyllabusSubscriptions,
  subscribeSyllabus,
  unsubscribeSyllabus
} from "../../syllabus_subscription_module.js?v=20260827-student-subscriptions-v1";
const GUARDIAN_SIGN_IN_URL =
  "/features/guardian/pages/sign_in/sign_in.html";

const lookupFormEl = document.querySelector("#student-lookup-form");
const studentIdEl = document.querySelector("#student-id");
const loadButtonEl = document.querySelector("#load-subscriptions");
const statusEl = document.querySelector("#subscription-status");
const resultsEl = document.querySelector("#subscription-results");
const subscribedListEl = document.querySelector("#subscribed-syllabuses");
const availableListEl = document.querySelector("#available-syllabuses");
const subscribedCountEl = document.querySelector("#subscribed-count");
const availableCountEl = document.querySelector("#available-count");

let currentGuardianId = "";
let currentStudentId = "";
let subscriptions = [];
let availableSyllabuses = [];
let syllabusById = new Map();
let isBusy = false;

function normalizeStudentId(studentId) {
  const normalizedStudentId = String(studentId ?? "").trim();

  if (!normalizedStudentId) {
    throw new Error("Student ID is required.");
  }

  return normalizedStudentId;
}

function waitForGuardianAuthState() {
  return new Promise((resolve, reject) => {
    let unsubscribe = null;

    try {
      unsubscribe = onGuardianAuthStateChanged((authUser) => {
        unsubscribe?.();
        resolve(authUser);
      });
    } catch (error) {
      reject(error);
    }
  });
}

async function requireGuardianStudentAccess(studentId) {
  if (!currentGuardianId) {
    throw new Error("A guardian account is required.");
  }

  const link = await getGuardianStudentLink({
    guardianId: currentGuardianId,
    studentId
  });

  if (!link || link.state !== guardianStudentLinkStates.ACTIVE) {
    throw new Error("This student is not actively linked to your guardian account.");
  }

  return link;
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("is-error", isError);
  statusEl.hidden = !message;
}

function setBusy(busy) {
  isBusy = busy;
  studentIdEl.disabled = busy;
  loadButtonEl.disabled = busy;
  document.querySelectorAll(".syllabus-row button").forEach((button) => {
    button.disabled = busy;
  });
}

function getSyllabusTitle(syllabusId) {
  return syllabusById.get(syllabusId)?.subject || syllabusId;
}

function getSyllabusDetail(syllabusId, language) {
  const syllabus = syllabusById.get(syllabusId);

  return syllabus
    ? [
      syllabus.country,
      syllabus.level,
      syllabus.year ? `Year ${syllabus.year}` : "",
      language
    ].filter(Boolean).join(" / ")
    : [syllabusId, language].filter(Boolean).join(" / ");
}

function createEmptyMessage(message) {
  const empty = document.createElement("p");

  empty.className = "empty-message";
  empty.textContent = message;
  return empty;
}

function createSyllabusSummary(syllabusId, language, state = null) {
  const summary = document.createElement("div");
  const heading = document.createElement("div");
  const title = document.createElement("h3");
  const detail = document.createElement("p");

  heading.className = "syllabus-heading";
  title.textContent = getSyllabusTitle(syllabusId);
  detail.className = "syllabus-detail";
  detail.textContent = getSyllabusDetail(syllabusId, language);
  heading.append(title);

  if (state) {
    const badge = document.createElement("span");

    badge.className = `state-badge is-${state}`;
    badge.textContent = state;
    heading.append(badge);
  }

  summary.append(heading, detail);
  return summary;
}

async function performAction(progressMessage, successMessage, action) {
  if (isBusy) {
    return;
  }

  setBusy(true);
  setStatus(progressMessage);

  try {
    await requireGuardianStudentAccess(currentStudentId);
    await action();
    await loadSubscriptionData();
    renderPage();
    setStatus(successMessage);
  } catch (error) {
    console.error(error);
    setStatus(error.message || "The subscription update failed.", true);
  } finally {
    setBusy(false);
  }
}

function renderSubscribedSyllabuses() {
  subscribedListEl.replaceChildren();
  subscribedCountEl.textContent = String(subscriptions.length);

  if (subscriptions.length === 0) {
    subscribedListEl.append(
      createEmptyMessage("This student has no syllabus subscriptions.")
    );
    return;
  }

  subscriptions.forEach((subscription) => {
    const row = document.createElement("article");
    const actions = document.createElement("div");
    const stateButton = document.createElement("button");
    const unsubscribeButton = document.createElement("button");
    const isActive = subscription.state === "active";

    row.className = "syllabus-row";
    actions.className = "row-actions";
    stateButton.type = "button";
    stateButton.className = "state-button";
    stateButton.textContent = isActive ? "Deactivate" : "Activate";
    stateButton.disabled = isBusy;
    unsubscribeButton.type = "button";
    unsubscribeButton.className = "unsubscribe-button";
    unsubscribeButton.textContent = "Unsubscribe";
    unsubscribeButton.disabled = isBusy;

    stateButton.addEventListener("click", () => {
      const action = isActive ? deactivateSyllabus : activateSyllabus;
      const actionLabel = isActive ? "Deactivating" : "Activating";
      const resultLabel = isActive ? "deactivated" : "activated";

      void performAction(
        `${actionLabel} ${getSyllabusTitle(subscription.syllabusId)}...`,
        `${getSyllabusTitle(subscription.syllabusId)} ${resultLabel}.`,
        () => action(
          currentStudentId,
          subscription.syllabusId,
          subscription.language
        )
      );
    });

    unsubscribeButton.addEventListener("click", () => {
      void performAction(
        `Unsubscribing ${getSyllabusTitle(subscription.syllabusId)}...`,
        `${getSyllabusTitle(subscription.syllabusId)} unsubscribed.`,
        () => unsubscribeSyllabus(
          currentStudentId,
          subscription.syllabusId
        )
      );
    });

    actions.append(stateButton, unsubscribeButton);
    row.append(
      createSyllabusSummary(
        subscription.syllabusId,
        subscription.language,
        subscription.state
      ),
      actions
    );
    subscribedListEl.append(row);
  });
}

function renderAvailableSyllabuses() {
  availableListEl.replaceChildren();
  availableCountEl.textContent = String(availableSyllabuses.length);

  if (availableSyllabuses.length === 0) {
    availableListEl.append(
      createEmptyMessage("No additional syllabuses are available for this student.")
    );
    return;
  }

  availableSyllabuses.forEach(({ syllabusId, language }) => {
    const row = document.createElement("article");
    const subscribeButton = document.createElement("button");

    row.className = "syllabus-row";
    subscribeButton.type = "button";
    subscribeButton.textContent = "Subscribe";
    subscribeButton.disabled = isBusy;
    subscribeButton.addEventListener("click", () => {
      void performAction(
        `Subscribing to ${getSyllabusTitle(syllabusId)}...`,
        `${getSyllabusTitle(syllabusId)} subscribed.`,
        () => subscribeSyllabus(currentStudentId, syllabusId, language)
      );
    });

    row.append(
      createSyllabusSummary(syllabusId, language),
      subscribeButton
    );
    availableListEl.append(row);
  });
}

function renderPage() {
  renderSubscribedSyllabuses();
  renderAvailableSyllabuses();
  resultsEl.hidden = false;
}

async function loadSyllabusDetails(syllabusIds) {
  const entries = await Promise.all(Array.from(syllabusIds).map(async (
    syllabusId
  ) => {
    try {
      return [syllabusId, await getSyllabusById(syllabusId)];
    } catch (error) {
      console.error(`Could not load syllabus ${syllabusId}.`, error);
      return [syllabusId, null];
    }
  }));

  syllabusById = new Map(entries);
}

async function loadSubscriptionData() {
  const [loadedSubscriptions, availability] = await Promise.all([
    listStudentSyllabusSubscriptions(currentStudentId),
    listAvailableSyllabusesForStudent(currentStudentId)
  ]);
  const subscribedIds = new Set(
    loadedSubscriptions.map(({ syllabusId }) => syllabusId)
  );

  subscriptions = loadedSubscriptions;
  availableSyllabuses = availability.filter(
    ({ syllabusId }) => !subscribedIds.has(syllabusId)
  );

  await loadSyllabusDetails(new Set([
    ...subscriptions.map(({ syllabusId }) => syllabusId),
    ...availableSyllabuses.map(({ syllabusId }) => syllabusId)
  ]));
}

async function loadStudent(studentId) {
  if (isBusy) {
    return;
  }

  let requestedStudentId = "";

  try {
    requestedStudentId = normalizeStudentId(studentId);
  } catch (error) {
    setStatus(error.message, true);
    return;
  }

  studentIdEl.value = requestedStudentId;
  resultsEl.hidden = true;
  setBusy(true);
  setStatus("Checking guardian access...");

  try {
    await requireGuardianStudentAccess(requestedStudentId);
    currentStudentId = requestedStudentId;
    setStatus("Loading syllabus subscriptions...");
    await loadSubscriptionData();
    renderPage();
    window.history.replaceState(
      {},
      "",
      `${window.location.pathname}?studentId=${encodeURIComponent(currentStudentId)}`
    );
    setStatus(
      `${subscriptions.length} subscribed; ${availableSyllabuses.length} additional available.`
    );
  } catch (error) {
    console.error(error);
    subscriptions = [];
    availableSyllabuses = [];
    syllabusById = new Map();
    setStatus(error.message || "Could not load syllabus subscriptions.", true);
  } finally {
    setBusy(false);
  }
}

lookupFormEl.addEventListener("submit", (event) => {
  event.preventDefault();

  if (!lookupFormEl.reportValidity()) {
    return;
  }

  void loadStudent(studentIdEl.value);
});

async function initializePage() {
  setBusy(true);
  setStatus("Checking guardian account...");

  try {
    const authUser = await waitForGuardianAuthState();

    if (!authUser) {
      window.location.replace(GUARDIAN_SIGN_IN_URL);
      return;
    }

    const guardian = await getGuardianById(authUser.uid);

    if (!guardian) {
      throw new Error("The signed-in account is not a guardian account.");
    }

    currentGuardianId = authUser.uid;
    setBusy(false);

    const initialStudentId = new URLSearchParams(window.location.search)
      .get("studentId");

    if (initialStudentId) {
      studentIdEl.value = initialStudentId;
      await loadStudent(initialStudentId);
    } else {
      setStatus("Enter the ID of a student linked to your guardian account.");
    }
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Could not verify the guardian account.", true);
  }
}

void initializePage();
