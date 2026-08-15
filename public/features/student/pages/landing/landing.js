import {
  clearCurrentStudent,
  loadCurrentStudent,
  onStudentAuthStateChanged,
  signOutStudent
} from "../../student_module.js?v=20260716-no-eager-auth";

const INDEX_URL = "/index.html";

const welcomeEl = document.querySelector("#student-welcome");
const statusEl = document.querySelector("#student-landing-status");
const logOffButton = document.querySelector("#student-log-off");

let authenticatedStudentId = null;

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("is-error", isError);
}

async function handleAuthState(authUser) {
  if (!authUser) {
    window.location.replace(INDEX_URL);
    return;
  }

  if (authenticatedStudentId === authUser.uid) {
    return;
  }

  authenticatedStudentId = authUser.uid;

  try {
    const student = await loadCurrentStudent(authUser.uid);

    if (!student) {
      await signOutStudent();
      clearCurrentStudent();
      return;
    }

    welcomeEl.textContent = `Welcome, ${student.name}.`;
    setStatus("You are signed in.");
  } catch (error) {
    console.error(error);
    welcomeEl.textContent = "Welcome.";
    setStatus(error.message || "Could not load the student account.", true);
  }
}

onStudentAuthStateChanged((authUser) => {
  void handleAuthState(authUser);
});

logOffButton.addEventListener("click", async () => {
  logOffButton.disabled = true;
  setStatus("Signing out...");

  try {
    await signOutStudent();
    clearCurrentStudent();
    window.location.replace(INDEX_URL);
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Could not sign out.", true);
    logOffButton.disabled = false;
  }
});
