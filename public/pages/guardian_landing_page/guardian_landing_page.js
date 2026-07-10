import {
  getCurrentGuardian,
  onGuardianAuthStateChanged,
  signOutGuardian
} from "/handler/guardian_handler.js?v=20260710-google-auth-fix";

const GUARDIAN_SIGN_IN_PAGE_URL = "/pages/guardian_sign_in/guardian_sign_in.html";
const GUARDIAN_LOG_OUT_REDIRECT_URL = "/index.html";

const subtitleEl = document.querySelector("#guardian-landing-subtitle");
const profileEl = document.querySelector("#guardian-profile");
const statusEl = document.querySelector("#guardian-landing-status");
const logOutButton = document.querySelector("#guardian-log-out");
let isLoggingOut = false;

const fieldEls = {
  name: document.querySelector("#guardian-profile-name"),
  email: document.querySelector("#guardian-profile-email"),
  authType: document.querySelector("#guardian-profile-auth-type"),
  registrationDate: document.querySelector("#guardian-profile-registration-date")
};

function setStatus(message, isError = false) {
  if (!statusEl) {
    return;
  }

  statusEl.classList.toggle("is-error", isError);
  statusEl.textContent = message;
}

function setText(element, value) {
  if (element) {
    element.textContent = value;
  }
}

function setHidden(element, isHidden) {
  if (element) {
    element.hidden = isHidden;
  }
}

function formatDate(value) {
  if (!value) {
    return "";
  }

  if (typeof value.toDate === "function") {
    return value.toDate().toLocaleDateString();
  }

  if (value instanceof Date) {
    return value.toLocaleDateString();
  }

  return String(value);
}

function renderGuardian(guardian) {
  setText(fieldEls.name, guardian.name || "");
  setText(fieldEls.email, guardian.email || "");
  setText(fieldEls.authType, guardian.authType || guardian.authMethod || "");
  setText(fieldEls.registrationDate, formatDate(guardian.registrationDate));
  setText(subtitleEl, `Welcome, ${guardian.name || "guardian"}.`);
  setHidden(profileEl, false);
  setHidden(logOutButton, false);
  setStatus("Signed in.");
}

onGuardianAuthStateChanged(async (user) => {
  if (!user) {
    if (isLoggingOut) {
      return;
    }

    window.location.href = GUARDIAN_SIGN_IN_PAGE_URL;
    return;
  }

  try {
    const currentGuardian = await getCurrentGuardian();

    if (!currentGuardian?.guardian) {
      setStatus("Signed in, but no guardian profile was found.", true);
      return;
    }

    renderGuardian(currentGuardian.guardian);
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Could not load guardian profile.", true);
  }
});

if (logOutButton) {
  logOutButton.addEventListener("click", async () => {
    isLoggingOut = true;
    logOutButton.disabled = true;
    setStatus("Logging out...");

    try {
      const result = await signOutGuardian();

      window.location.href = result.redirectUrl || GUARDIAN_LOG_OUT_REDIRECT_URL;
    } catch (error) {
      console.error(error);
      isLoggingOut = false;
      logOutButton.disabled = false;
      setStatus(error.message || "Could not log out.", true);
    }
  });
}
