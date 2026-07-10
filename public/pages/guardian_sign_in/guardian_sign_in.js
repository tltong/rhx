import {
  signInGuardianWithEmail,
  signInGuardianWithGoogle
} from "/handler/guardian_handler.js?v=20260710-google-auth-fix";

const emailForm = document.querySelector("#guardian-email-sign-in-form");
const emailSubmitButton = document.querySelector("#guardian-email-sign-in-submit");
const googleButton = document.querySelector("#guardian-google-sign-in");
const statusEl = document.querySelector("#guardian-sign-in-status");

function setStatus(message, isError = false) {
  statusEl.classList.toggle("is-error", isError);
  statusEl.textContent = message;
}

function setBusy(isBusy) {
  emailSubmitButton.disabled = isBusy;
  googleButton.disabled = isBusy;
  emailSubmitButton.textContent = isBusy ? "Signing in..." : "Sign In With Email";
  googleButton.textContent = isBusy ? "Please wait..." : "Sign In With Google";
}

function showError(error, fallbackMessage) {
  console.error(error);
  setStatus(error.message || fallbackMessage, true);
}

emailForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setBusy(true);
  setStatus("Signing in...");

  try {
    const formData = new FormData(emailForm);
    const result = await signInGuardianWithEmail(
      formData.get("email"),
      formData.get("password")
    );

    setStatus("Signed in. Opening guardian page...");
    window.location.href = result.landingPageUrl;
  } catch (error) {
    showError(error, "Could not sign in.");
  } finally {
    setBusy(false);
  }
});

googleButton.addEventListener("click", async () => {
  setBusy(true);
  setStatus("Opening Google sign in...");

  try {
    const result = await signInGuardianWithGoogle();

    setStatus("Signed in with Google. Opening guardian page...");
    window.location.href = result.landingPageUrl;
  } catch (error) {
    showError(error, "Could not sign in with Google.");
  } finally {
    setBusy(false);
  }
});
