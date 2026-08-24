import {
  getGuardianById,
  onGuardianAuthStateChanged,
  signInGuardianWithEmail,
  signInGuardianWithGoogle
} from "../../guardian_module.js?v=20260825-guardian-sign-in-v2";

const GUARDIAN_LANDING_URL = "/features/guardian/pages/landing/landing.html";

const formEl = document.querySelector("#guardian-email-sign-in-form");
const emailSubmitEl = document.querySelector("#guardian-email-sign-in");
const googleSubmitEl = document.querySelector("#guardian-google-sign-in");
const statusEl = document.querySelector("#guardian-sign-in-status");

let isSubmitting = false;
let isCheckingSession = true;

function getFriendlyError(error) {
  const messages = {
    "auth/invalid-credential": "Email or password is incorrect.",
    "auth/invalid-login-credentials": "Email or password is incorrect.",
    "auth/wrong-password": "Email or password is incorrect.",
    "auth/user-not-found": "Email or password is incorrect.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/user-disabled": "This account has been disabled.",
    "auth/too-many-requests": "Too many attempts. Please wait before trying again.",
    "auth/popup-blocked": "Allow pop-ups for this site, then try Google sign in again.",
    "auth/popup-closed-by-user": "Google sign in was cancelled.",
    "auth/cancelled-popup-request": "Google sign in was cancelled.",
    "auth/account-exists-with-different-credential": "This email uses another sign-in method.",
    "auth/unauthorized-domain": "Google sign in is not enabled for this website domain.",
    "guardian/profile-not-found": "No guardian account was found for these credentials."
  };

  return messages[error?.code] || error?.message || "Could not sign in.";
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("is-error", isError);
  statusEl.hidden = false;
}

function updateActions() {
  emailSubmitEl.disabled = isCheckingSession || isSubmitting || !formEl.checkValidity();
  googleSubmitEl.disabled = isCheckingSession || isSubmitting;
}

function setSubmitting(submitting) {
  isSubmitting = submitting;
  Array.from(formEl.elements).forEach((element) => {
    element.disabled = submitting;
  });
  updateActions();
}

function goToGuardianLanding() {
  window.location.replace(GUARDIAN_LANDING_URL);
}

formEl.addEventListener("input", updateActions);

formEl.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (isCheckingSession || isSubmitting || !formEl.reportValidity()) {
    return;
  }

  const formData = new FormData(formEl);
  setSubmitting(true);
  setStatus("Signing in...");

  try {
    await signInGuardianWithEmail({
      email: String(formData.get("email") ?? "").trim().toLowerCase(),
      password: String(formData.get("password") ?? "")
    });
    goToGuardianLanding();
  } catch (error) {
    console.error(error);
    setStatus(getFriendlyError(error), true);
    setSubmitting(false);
  }
});

googleSubmitEl.addEventListener("click", async () => {
  if (isCheckingSession || isSubmitting) {
    return;
  }

  setSubmitting(true);
  setStatus("Opening Google sign in...");

  try {
    await signInGuardianWithGoogle();
    goToGuardianLanding();
  } catch (error) {
    console.error(error);
    setStatus(getFriendlyError(error), true);
    setSubmitting(false);
  }
});

onGuardianAuthStateChanged(async (authUser) => {
  try {
    if (authUser) {
      const guardian = await getGuardianById(authUser.uid);

      if (guardian) {
        goToGuardianLanding();
        return;
      }
    }
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Could not check the current session.", true);
  } finally {
    isCheckingSession = false;
    updateActions();
  }
});

updateActions();
