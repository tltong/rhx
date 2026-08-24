import {
  signUpGuardianWithEmail,
  signUpGuardianWithGoogle
} from "../../guardian_module.js?v=20260825-guardian-landing-v1";

const GUARDIAN_LANDING_URL = "/features/guardian/pages/landing/landing.html";

const formEl = document.querySelector("#guardian-email-sign-up-form");
const emailSubmitEl = document.querySelector("#guardian-email-sign-up");
const googleSubmitEl = document.querySelector("#guardian-google-sign-up");
const statusEl = document.querySelector("#guardian-sign-up-status");

let isSubmitting = false;

function getFriendlyError(error) {
  const messages = {
    "auth/email-already-in-use": "An account already exists for this email address.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/weak-password": "Use a password with at least 6 characters.",
    "auth/popup-blocked": "Allow pop-ups for this site, then try Google sign up again.",
    "auth/popup-closed-by-user": "Google sign up was cancelled.",
    "auth/cancelled-popup-request": "Google sign up was cancelled.",
    "auth/account-exists-with-different-credential": "This email already uses another sign-in method.",
    "auth/operation-not-allowed": "This sign-up method is not enabled yet.",
    "auth/unauthorized-domain": "Google sign up is not enabled for this website domain."
  };

  return messages[error?.code] || error?.message || "Could not create the guardian account.";
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("is-error", isError);
  statusEl.hidden = false;
}

function updateActions() {
  emailSubmitEl.disabled = isSubmitting || !formEl.checkValidity();
  googleSubmitEl.disabled = isSubmitting;
}

function setSubmitting(submitting) {
  isSubmitting = submitting;
  Array.from(formEl.elements).forEach((element) => {
    element.disabled = submitting;
  });
  updateActions();
}

function goToGuardianLanding() {
  window.location.assign(GUARDIAN_LANDING_URL);
}

formEl.addEventListener("input", updateActions);

formEl.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (isSubmitting || !formEl.reportValidity()) {
    return;
  }

  const formData = new FormData(formEl);
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (password !== confirmPassword) {
    setStatus("Passwords do not match.", true);
    return;
  }

  setSubmitting(true);
  setStatus("Creating guardian account...");

  try {
    await signUpGuardianWithEmail({ name, email, password });
    goToGuardianLanding();
  } catch (error) {
    console.error(error);
    setStatus(getFriendlyError(error), true);
    setSubmitting(false);
  }
});

googleSubmitEl.addEventListener("click", async () => {
  if (isSubmitting) {
    return;
  }

  setSubmitting(true);
  setStatus("Opening Google sign up...");

  try {
    await signUpGuardianWithGoogle();
    goToGuardianLanding();
  } catch (error) {
    console.error(error);
    setStatus(getFriendlyError(error), true);
    setSubmitting(false);
  }
});

updateActions();
