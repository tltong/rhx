import {
  getGuardianById,
  onGuardianAuthStateChanged,
  signOutGuardian
} from "../../guardian_module.js?v=20260825-guardian-sign-in-v1";
import {
  searchStudents,
  studentLevels
} from "../../../student/student_module.js?v=20260825-guardian-student-search-v1";
import {
  guardianStudentRelationships,
  linkStudentToGuardian,
  listLinkedStudentsForGuardian
} from "../../../guardian_student_link/guardian_student_link_module.js?v=20260825-guardian-student-links-v1";
import {
  isCurrentUserSiteAdmin
} from "../../../site_admin/site_admin_module.js?v=20260827-site-admin-nav-v1";

const HOME_URL = "/index.html";

const profileEl = document.querySelector("#guardian-profile");
const nameEl = document.querySelector("#guardian-name");
const emailEl = document.querySelector("#guardian-email");
const authTypeEl = document.querySelector("#guardian-auth-type");
const initialsEl = document.querySelector("#guardian-initials");
const welcomeEl = document.querySelector("#welcome-heading");
const linkedPanelEl = document.querySelector("#linked-students-panel");
const linkedListEl = document.querySelector("#linked-student-list");
const linkedEmptyEl = document.querySelector("#linked-students-empty");
const showLinkStudentEl = document.querySelector("#show-link-student");
const linkPanelEl = document.querySelector("#link-student-panel");
const cancelLinkStudentEl = document.querySelector("#cancel-link-student");
const searchFormEl = document.querySelector("#student-search-form");
const searchLevelEl = document.querySelector("#student-search-level");
const relationshipEl = document.querySelector("#student-link-relationship");
const searchSubmitEl = document.querySelector("#student-search-submit");
const searchResultsEl = document.querySelector("#student-search-results");
const searchResultListEl = document.querySelector("#student-search-result-list");
const statusEl = document.querySelector("#guardian-landing-status");
const signOutEl = document.querySelector("#guardian-sign-out");
const siteAdminNavigationEl = document.querySelector("#site-admin-navigation");

let currentGuardianId = null;
let linkedStudentIds = new Set();
let isSearchBusy = false;
let hasLoadedGuardian = false;

function titleCase(value) {
  const text = String(value ?? "").trim();

  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "Unknown";
}

function getInitials(name) {
  return String(name)
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("is-error", isError);
  statusEl.hidden = !message;
}

async function updateSiteAdminNavigation() {
  siteAdminNavigationEl.hidden = true;

  try {
    const status = await isCurrentUserSiteAdmin();
    siteAdminNavigationEl.hidden = !status.isAdmin;
  } catch (error) {
    console.error("Could not check site-admin access.", error);
  }
}

function renderOptions(select, values, labelFormatter = titleCase) {
  Object.values(values).forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = labelFormatter(value);
    select.append(option);
  });
}

function renderGuardian(guardian) {
  nameEl.textContent = guardian.name;
  emailEl.textContent = guardian.email;
  authTypeEl.textContent = titleCase(guardian.authType);
  initialsEl.textContent = getInitials(guardian.name);
  welcomeEl.textContent = `Welcome, ${guardian.name}`;
  profileEl.hidden = false;
}

function createStudentCard(student, relationship = null, linkAction = null) {
  const card = document.createElement("article");
  const header = document.createElement("div");
  const studentName = document.createElement("h3");
  const meta = document.createElement("p");

  card.className = "student-card";
  header.className = "student-card-header";
  studentName.textContent = student?.name || "Student unavailable";
  meta.className = "student-meta";
  meta.textContent = student
    ? `${titleCase(student.level)} / Year ${student.grade} / Born ${student.yearOfBirth}`
    : "The student profile could not be loaded.";
  header.append(studentName);

  if (relationship) {
    const badge = document.createElement("span");
    badge.className = "relationship-badge";
    badge.textContent = relationship;
    header.append(badge);
  }

  card.append(header, meta);

  if (linkAction && student) {
    const button = document.createElement("button");
    button.className = "link-button";
    button.type = "button";
    button.dataset.studentId = student.id;
    button.textContent = linkedStudentIds.has(student.id) ? "Already linked" : "Link student";
    button.disabled = linkedStudentIds.has(student.id);
    button.addEventListener("click", () => linkAction(student, button));
    card.append(button);
  }

  return card;
}

function updateSearchAvailability() {
  searchSubmitEl.disabled = isSearchBusy || !searchFormEl.checkValidity();
}

function setSearchBusy(busy) {
  isSearchBusy = busy;
  Array.from(searchFormEl.elements).forEach((element) => {
    element.disabled = busy;
  });
  searchResultListEl.querySelectorAll("button").forEach((button) => {
    button.disabled = busy || linkedStudentIds.has(button.dataset.studentId);
  });
  updateSearchAvailability();
}

function showSearchPanel(show) {
  linkPanelEl.hidden = !show;
  cancelLinkStudentEl.hidden = linkedStudentIds.size === 0;

  if (!show) {
    searchResultsEl.hidden = true;
  }
}

async function loadLinkedStudents() {
  const linkedStudents = await listLinkedStudentsForGuardian(currentGuardianId);

  linkedStudentIds = new Set(linkedStudents
    .map(({ student }) => student?.id)
    .filter(Boolean));
  linkedListEl.replaceChildren();
  linkedStudents.forEach(({ link, student }) => {
    linkedListEl.append(createStudentCard(student, link.relationship));
  });

  const hasLinkedStudents = linkedStudents.length > 0;
  linkedEmptyEl.hidden = hasLinkedStudents;
  showLinkStudentEl.hidden = !hasLinkedStudents;
  linkedPanelEl.hidden = false;
  showSearchPanel(!hasLinkedStudents);
}

async function linkStudent(student, button) {
  if (!relationshipEl.value || isSearchBusy) {
    return;
  }

  setSearchBusy(true);
  button.textContent = "Linking...";
  setStatus("Linking student...");

  try {
    await linkStudentToGuardian({
      guardianId: currentGuardianId,
      studentId: student.id,
      relationship: relationshipEl.value
    });
    await loadLinkedStudents();
    searchFormEl.reset();
    searchResultListEl.replaceChildren();
    searchResultsEl.hidden = true;
    setStatus(`${student.name} is now linked to your guardian account.`);
  } catch (error) {
    console.error(error);
    button.textContent = "Link student";
    setStatus(error.message || "Could not link the student.", true);
  } finally {
    setSearchBusy(false);
  }
}

searchFormEl.addEventListener("input", updateSearchAvailability);
searchFormEl.addEventListener("change", updateSearchAvailability);

searchFormEl.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (isSearchBusy || !searchFormEl.reportValidity()) {
    return;
  }

  const formData = new FormData(searchFormEl);
  setSearchBusy(true);
  setStatus("Searching for matching students...");

  try {
    const students = await searchStudents({
      name: formData.get("name"),
      yearOfBirth: Number(formData.get("yearOfBirth")),
      level: formData.get("level"),
      grade: Number(formData.get("grade"))
    });

    searchResultListEl.replaceChildren();

    if (students.length === 0) {
      const emptyResult = document.createElement("p");
      emptyResult.className = "empty-message";
      emptyResult.textContent = "No student matched all four search fields.";
      searchResultListEl.append(emptyResult);
    } else {
      students.forEach((student) => {
        searchResultListEl.append(createStudentCard(student, null, linkStudent));
      });
    }

    searchResultsEl.hidden = false;
    setStatus("");
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Could not search for students.", true);
  } finally {
    setSearchBusy(false);
  }
});

showLinkStudentEl.addEventListener("click", () => {
  showSearchPanel(true);
  linkPanelEl.scrollIntoView({ behavior: "smooth", block: "start" });
});

cancelLinkStudentEl.addEventListener("click", () => {
  showSearchPanel(false);
});

onGuardianAuthStateChanged(async (authUser) => {
  if (!authUser) {
    window.location.replace(HOME_URL);
    return;
  }

  if (hasLoadedGuardian) {
    return;
  }

  hasLoadedGuardian = true;
  currentGuardianId = authUser.uid;

  try {
    const guardian = await getGuardianById(authUser.uid);

    if (!guardian) {
      throw new Error("No guardian profile was found for this account.");
    }

    renderGuardian(guardian);
    await Promise.all([
      loadLinkedStudents(),
      updateSiteAdminNavigation()
    ]);
    setStatus("");
  } catch (error) {
    console.error(error);
    hasLoadedGuardian = false;
    setStatus(error.message || "Could not load the guardian account.", true);
  }
});

signOutEl.addEventListener("click", async () => {
  signOutEl.disabled = true;

  try {
    await signOutGuardian();
    window.location.replace(HOME_URL);
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Could not log out.", true);
    signOutEl.disabled = false;
  }
});

renderOptions(searchLevelEl, studentLevels);
renderOptions(relationshipEl, guardianStudentRelationships);
document.querySelector("input[name='yearOfBirth']").max = String(new Date().getFullYear());
updateSearchAvailability();
