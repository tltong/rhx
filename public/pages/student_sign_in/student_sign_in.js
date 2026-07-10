import { signInStudent } from "/handler/student_handler.js";

const form = document.querySelector("#student-sign-in-form");
const submitButton = document.querySelector("#student-sign-in-submit");
const statusEl = document.querySelector("#student-sign-in-status");
const usernameInput = document.querySelector("#student-username");
const emailPreviewEl = document.querySelector("#student-email-preview");
const pinInput = document.querySelector("#student-pin");

function setStatus(message, isError = false) {
  statusEl.classList.toggle("is-error", isError);
  statusEl.textContent = message;
}

function setBusy(isBusy) {
  submitButton.disabled = isBusy;
  submitButton.textContent = isBusy ? "Signing in..." : "Sign In";
}

function updateEmailPreview() {
  const username = usernameInput.value.trim().toLowerCase();
  const previewUsername = username || "username";

  emailPreviewEl.textContent = `Your login email is ${previewUsername}@rhx.com.`;
}

pinInput.addEventListener("input", () => {
  pinInput.value = pinInput.value.replace(/\D/g, "").slice(0, 6);
});

usernameInput.addEventListener("input", updateEmailPreview);

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setBusy(true);
  setStatus("Signing in...");

  try {
    const formData = new FormData(form);
    const result = await signInStudent(
      formData.get("username"),
      formData.get("pin")
    );

    setStatus("Signed in. Opening student landing page...");
    window.location.href = result.landingPageUrl;
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Could not sign in.", true);
  } finally {
    setBusy(false);
  }
});

updateEmailPreview();
