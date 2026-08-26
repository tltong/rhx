import {
  addSiteAdminEmail,
  isCurrentUserSiteAdmin,
  listSiteAdminEmails,
  removeSiteAdminEmail
} from "../../site_admin_module.js?v=20260826-site-admin-v1";
import {
  onFirebaseAuthStateChanged
} from "../../../../utils/firebase/firebase_auth.js";

const accountEl = document.querySelector("#site-admin-account");
const formEl = document.querySelector("#site-admin-form");
const emailEl = document.querySelector("#site-admin-email");
const addButton = document.querySelector("#site-admin-add");
const listEl = document.querySelector("#site-admin-list");
const emptyEl = document.querySelector("#site-admin-empty");
const statusEl = document.querySelector("#site-admin-status");

let currentStatus = null;
let isBusy = false;

function setMessage(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("is-error", isError);
}

function setBusy(value) {
  isBusy = value;
  addButton.disabled = value || addButton.dataset.allowed !== "true";
  emailEl.disabled = value || emailEl.dataset.allowed !== "true";
  listEl.querySelectorAll("button").forEach((button) => {
    button.disabled = value || button.dataset.allowed !== "true";
  });
}

function renderAccount(status) {
  if (!status.email) {
    accountEl.textContent = "Not signed in";
    return;
  }

  const verification = status.emailVerified ? "verified" : "not verified";
  const role = status.isAdmin ? "site admin" : "not a site admin";

  accountEl.textContent = `${status.email} / ${verification} / ${role}`;
}

function renderEmails(emails) {
  listEl.replaceChildren();
  emptyEl.hidden = emails.length > 0;

  emails.forEach((email) => {
    const item = document.createElement("li");
    const value = document.createElement("span");
    const removeButton = document.createElement("button");
    const canRemove = currentStatus?.isAdmin
      && email !== currentStatus.email;

    item.className = "admin-row";
    value.textContent = email;
    removeButton.type = "button";
    removeButton.className = "remove-button";
    removeButton.textContent = "Remove";
    removeButton.dataset.allowed = String(canRemove);
    removeButton.disabled = isBusy || !canRemove;
    removeButton.addEventListener("click", () => {
      void removeEmail(email);
    });
    item.append(value, removeButton);
    listEl.append(item);
  });
}

function configureAddControl(status) {
  const canBootstrap = status.bootstrapAvailable
    && Boolean(status.email)
    && status.emailVerified;
  const canAdd = status.isAdmin || canBootstrap;

  emailEl.dataset.allowed = String(canAdd);
  addButton.dataset.allowed = String(canAdd);
  emailEl.disabled = isBusy || !canAdd;
  addButton.disabled = isBusy || !canAdd;
  emailEl.readOnly = canBootstrap && !status.isAdmin;

  if (canBootstrap) {
    emailEl.value = status.email;
  } else if (!status.isAdmin) {
    emailEl.value = "";
  }
}

async function refresh() {
  setBusy(true);
  setMessage("Checking site-admin access...");

  try {
    currentStatus = await isCurrentUserSiteAdmin();
    renderAccount(currentStatus);
    configureAddControl(currentStatus);

    if (currentStatus.bootstrapAvailable) {
      renderEmails([]);

      if (!currentStatus.email) {
        setMessage("Sign in to add the first site administrator.");
      } else if (!currentStatus.emailVerified) {
        setMessage("Verify the signed-in email before adding the first administrator.");
      } else {
        setMessage("No site administrators exist. Add the signed-in email to begin.");
      }

      return;
    }

    if (!currentStatus.isAdmin) {
      renderEmails([]);
      setMessage(
        "This page is open, but the signed-in account cannot manage site administrators.",
        true
      );
      return;
    }

    const result = await listSiteAdminEmails();

    renderEmails(result.emails);
    setMessage("Site administrators loaded.");
  } catch (error) {
    console.error(error);
    currentStatus = null;
    renderEmails([]);
    setMessage(error.message || "Could not load site administrators.", true);
  } finally {
    setBusy(false);
  }
}

async function removeEmail(email) {
  setBusy(true);
  setMessage(`Removing ${email}...`);

  try {
    await removeSiteAdminEmail(email);
    await refresh();
  } catch (error) {
    console.error(error);
    setMessage(error.message || "Could not remove the site administrator.", true);
    setBusy(false);
  }
}

formEl.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (isBusy) {
    return;
  }

  setBusy(true);
  setMessage("Adding site administrator...");

  try {
    await addSiteAdminEmail(emailEl.value);
    emailEl.value = "";
    await refresh();
  } catch (error) {
    console.error(error);
    setMessage(error.message || "Could not add the site administrator.", true);
    setBusy(false);
  }
});

onFirebaseAuthStateChanged(() => {
  void refresh();
});
