import {
  signInGuardianWithGoogle,
  signUpGuardianWithEmail
} from "/handler/guardian_handler.js?v=20260710-google-auth-fix";

const emailForm = document.querySelector("#guardian-email-sign-up-form");
const emailSubmitButton = document.querySelector("#guardian-email-sign-up-submit");
const googleButton = document.querySelector("#guardian-google-sign-up");
const statusEl = document.querySelector("#guardian-sign-up-status");

function setStatus(message, isError = false) {
  statusEl.classList.toggle("is-error", isError);
  statusEl.textContent = message;
}

function setBusy(isBusy) {
  emailSubmitButton.disabled = isBusy;
  googleButton.disabled = isBusy;
  emailSubmitButton.textContent = isBusy ? "Creating account..." : "Sign Up With Email";
  googleButton.textContent = isBusy ? "Please wait..." : "Sign Up With Google";
}

function showError(error, fallbackMessage) {
  console.error(error);
  setStatus(error.message || fallbackMessage, true);
}

emailForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setBusy(true);
  setStatus("Creating guardian account...");

  try {
    const formData = new FormData(emailForm);
    const result = await signUpGuardianWithEmail({
      name: formData.get("name"),
      email: formData.get("email"),
      password: formData.get("password")
    });

    setStatus("Account created. Opening guardian page...");
    window.location.href = result.landingPageUrl;
  } catch (error) {
    showError(error, "Could not create guardian account.");
  } finally {
    setBusy(false);
  }
});

googleButton.addEventListener("click", async () => {
  setBusy(true);
  setStatus("Opening Google sign up...");

  try {
    const result = await signInGuardianWithGoogle();

    setStatus("Signed in with Google. Opening guardian page...");
    window.location.href = result.landingPageUrl;
  } catch (error) {
    showError(error, "Could not sign up with Google.");
  } finally {
    setBusy(false);
  }
});
