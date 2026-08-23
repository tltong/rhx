import {
  createStudentRecord,
  findStudentByUsername,
  signUpStudent
} from "../../student_module.js?v=20260823-student-country-v1";
import {
  studentLevels
} from "../../../../config/firebase/student_schema.js?v=20260823-student-country-v1";
import {
  listSyllabusScopeCountries
} from "../../../syllabusscope/syllabusscope_module.js?v=20260823-student-country-v1";
import {
  listStreamsByScope
} from "../../../stream/stream_module.js?v=20260823-student-standard-stream-v1";
import {
  subscribeStudentToStream
} from "../../../stream_subscription/stream_subscription_module.js?v=20260823-student-stream-v1";

const STUDENT_EMAIL_DOMAIN = "rhx.com";
const PIN_PATTERN = /^\d{6}$/;
const USERNAME_PATTERN = /^[a-z0-9._-]{3,40}$/;
const STUDENT_LEVELS = new Set(Object.values(studentLevels));

const formEl = document.querySelector("#student-sign-up-form");
const countryEl = document.querySelector("#student-country");
const levelEl = document.querySelector("#student-level");
const standardEl = document.querySelector("#student-standard");
const streamEl = document.querySelector("#student-stream");
const submitButton = document.querySelector("#student-sign-up-submit");
const statusEl = document.querySelector("#student-sign-up-status");

let availableCountries = [];
let availableStreams = [];
let isLoadingCountries = false;
let isLoadingStreams = false;
let isSubmitting = false;
let streamRequestId = 0;

function formatLevelLabel(level) {
  return level.charAt(0).toUpperCase() + level.slice(1);
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("is-error", isError);
}

function renderLevelOptions() {
  Object.values(studentLevels).forEach((level) => {
    const option = document.createElement("option");

    option.value = level;
    option.textContent = formatLevelLabel(level);
    levelEl.append(option);
  });
}

function resetStreamOptions(message = "Select country, level, and standard first") {
  streamEl.replaceChildren();
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = message;
  streamEl.append(placeholder);
  streamEl.disabled = true;
}

function updateSubmitAvailability() {
  submitButton.disabled = isLoadingCountries
    || isLoadingStreams
    || isSubmitting
    || availableCountries.length === 0
    || !streamEl.value
    || !formEl.checkValidity();
}

async function loadCountryOptions() {
  isLoadingCountries = true;
  countryEl.disabled = true;
  updateSubmitAvailability();
  setStatus("Loading countries...");

  try {
    availableCountries = await listSyllabusScopeCountries();

    if (availableCountries.length === 0) {
      throw new Error("No countries are available for student registration.");
    }

    countryEl.replaceChildren();
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Select country";
    countryEl.append(placeholder);

    availableCountries.forEach((country) => {
      const option = document.createElement("option");
      option.value = country;
      option.textContent = country;
      countryEl.append(option);
    });

    countryEl.disabled = false;
    setStatus("Ready.");
  } catch (error) {
    availableCountries = [];
    console.error(error);
    setStatus(error.message || "Could not load countries.", true);
  } finally {
    isLoadingCountries = false;
    updateSubmitAvailability();
  }
}

async function loadStreamOptions() {
  const requestId = ++streamRequestId;
  const country = countryEl.value;
  const level = levelEl.value;
  const year = Number(standardEl.value);

  availableStreams = [];
  isLoadingStreams = false;
  resetStreamOptions();

  if (!country || !level || !Number.isInteger(year)) {
    updateSubmitAvailability();
    return;
  }

  isLoadingStreams = true;
  resetStreamOptions("Loading streams...");
  updateSubmitAvailability();
  setStatus("Loading streams...");

  try {
    const streams = await listStreamsByScope(country, level, year);

    if (requestId !== streamRequestId) {
      return;
    }

    availableStreams = streams;
    streamEl.replaceChildren();

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = streams.length
      ? "Select stream"
      : "No streams available";
    streamEl.append(placeholder);

    streams.forEach((stream) => {
      const option = document.createElement("option");
      option.value = stream.id;
      option.textContent = stream.name;
      streamEl.append(option);
    });

    streamEl.disabled = streams.length === 0;
    setStatus(
      streams.length
        ? "Ready."
        : "No streams are available for the selected country and level.",
      streams.length === 0
    );
  } catch (error) {
    if (requestId !== streamRequestId) {
      return;
    }

    availableStreams = [];
    resetStreamOptions("Could not load streams");
    console.error(error);
    setStatus(error.message || "Could not load streams.", true);
  } finally {
    if (requestId === streamRequestId) {
      isLoadingStreams = false;
      updateSubmitAvailability();
    }
  }
}

function normalizeUsername(username) {
  const normalizedUsername = String(username || "").trim().toLowerCase();

  if (!USERNAME_PATTERN.test(normalizedUsername)) {
    throw new Error(
      "Username must be 3-40 characters using letters, numbers, dot, underscore, or hyphen."
    );
  }

  return normalizedUsername;
}

function buildStudentEmail(username) {
  return normalizeUsername(username) + "@" + STUDENT_EMAIL_DOMAIN;
}

function validatePin(pin) {
  const normalizedPin = String(pin || "").trim();

  if (!PIN_PATTERN.test(normalizedPin)) {
    throw new Error("PIN must be exactly 6 digits.");
  }

  return normalizedPin;
}

function validateLevel(level) {
  const normalizedLevel = String(level || "").trim().toLowerCase();

  if (!STUDENT_LEVELS.has(normalizedLevel)) {
    throw new Error(
      "Level must be one of: "
        + Object.values(studentLevels).join(", ")
        + "."
    );
  }

  return normalizedLevel;
}

function validateCountry(country) {
  const selectedCountry = String(country ?? "").trim();

  if (!availableCountries.includes(selectedCountry)) {
    throw new Error("Select an available country.");
  }

  return selectedCountry;
}

function validateStreamId(streamId) {
  const selectedStreamId = String(streamId ?? "").trim();
  const stream = availableStreams.find(
    (candidate) => candidate.id === selectedStreamId
  );

  if (!stream) {
    throw new Error("Select an available stream.");
  }

  return stream.id;
}

function getFormData() {
  const formData = new FormData(formEl);
  const now = new Date();
  const yearOfBirth = Number(formData.get("yearOfBirth"));

  if (!Number.isInteger(yearOfBirth)) {
    throw new Error("Year of birth must be a valid year.");
  }

  return {
    name: String(formData.get("name") || "").trim(),
    username: normalizeUsername(formData.get("username")),
    pin: validatePin(formData.get("pin")),
    yearOfBirth,
    country: validateCountry(formData.get("country")),
    level: validateLevel(formData.get("level")),
    streamId: validateStreamId(formData.get("streamId")),
    standardAtYearOfRegistration: String(
      formData.get("standard") || ""
    ).trim(),
    yearOfRegistration: now.getFullYear(),
    registrationDate: now
  };
}

countryEl.addEventListener("change", loadStreamOptions);
levelEl.addEventListener("change", loadStreamOptions);
standardEl.addEventListener("change", loadStreamOptions);
formEl.addEventListener("input", updateSubmitAvailability);
formEl.addEventListener("change", updateSubmitAvailability);

formEl.addEventListener("submit", async (event) => {
  event.preventDefault();

  isSubmitting = true;
  updateSubmitAvailability();
  setStatus("Creating student account...");

  try {
    const input = getFormData();
    const existingStudent = await findStudentByUsername(input.username);

    if (existingStudent) {
      throw new Error("Username is already taken.");
    }

    const email = buildStudentEmail(input.username);
    const authUser = await signUpStudent({
      email,
      password: input.pin,
      displayName: input.name
    });

    await createStudentRecord({
      id: authUser.uid,
      email,
      name: input.name,
      username: input.username,
      country: input.country,
      level: input.level,
      yearOfBirth: input.yearOfBirth,
      yearOfRegistration: input.yearOfRegistration,
      registrationDate: input.registrationDate,
      standardAtYearOfRegistration: input.standardAtYearOfRegistration
    });
    await subscribeStudentToStream(authUser.uid, input.streamId);

    formEl.reset();
    availableStreams = [];
    resetStreamOptions();
    setStatus("Student account created.");
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Could not create student account.", true);
  } finally {
    isSubmitting = false;
    updateSubmitAvailability();
  }
});

renderLevelOptions();
resetStreamOptions();
loadCountryOptions();