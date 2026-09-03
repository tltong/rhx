import {
  createPaymentCustomer,
  createStripeSetupIntent,
  deleteCustomer
} from "../../stripe_payment_module.js?v=20260904-stripe-setup-intent-v1";
import {
  getPaymentConfig
} from "../../../payment/payment_module.js?v=20260901-payment-config-simple-v1";

const createForm = document.querySelector("#create-customer-form");
const inputReferenceEl = document.querySelector("#input-reference");
const createButton = document.querySelector("#create-customer-button");
const createStatus = document.querySelector("#create-status");
const customerResult = document.querySelector("#customer-result");
const createdCustomerReference =
  document.querySelector("#created-customer-reference");

const setupIntentForm = document.querySelector("#setup-intent-form");
const setupCustomerReferenceEl =
  document.querySelector("#setup-customer-reference");
const createSetupIntentButton =
  document.querySelector("#create-setup-intent-button");
const setupIntentStatus =
  document.querySelector("#setup-intent-status");
const clientSecretResult =
  document.querySelector("#client-secret-result");
const setupIntentClientSecret =
  document.querySelector("#setup-intent-client-secret");

const deleteForm = document.querySelector("#delete-customer-form");
const customerReferenceEl =
  document.querySelector("#stripe-customer-reference");
const confirmDeleteEl = document.querySelector("#confirm-delete");
const deleteButton = document.querySelector("#delete-customer-button");
const deleteStatus = document.querySelector("#delete-status");
const paymentModeIndicator =
  document.querySelector("#payment-mode-indicator");
const paymentModeEl = document.querySelector("#payment-mode");

let isCreating = false;
let isCreatingSetupIntent = false;
let isDeleting = false;

function setStatus(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle("is-error", isError);
  element.hidden = !message;
}

async function loadPaymentMode() {
  try {
    const config = await getPaymentConfig();
    const mode = config?.mode || "";

    paymentModeEl.textContent = mode
      ? mode.toUpperCase()
      : "NOT CONFIGURED";
    paymentModeIndicator.classList.toggle("is-test", mode === "test");
    paymentModeIndicator.classList.toggle("is-prod", mode === "prod");
  } catch (error) {
    console.error(error);
    paymentModeEl.textContent = "UNAVAILABLE";
    paymentModeIndicator.classList.remove("is-test", "is-prod");
  }
}

function updateCreateControls() {
  inputReferenceEl.disabled = isCreating;
  createButton.disabled = isCreating || !createForm.checkValidity();
}

function updateDeleteControls() {
  customerReferenceEl.disabled = isDeleting;
  confirmDeleteEl.disabled = isDeleting;
  deleteButton.disabled =
    isDeleting
    || !deleteForm.checkValidity()
    || !confirmDeleteEl.checked;
}

function updateSetupIntentControls() {
  setupCustomerReferenceEl.disabled = isCreatingSetupIntent;
  createSetupIntentButton.disabled =
    isCreatingSetupIntent || !setupIntentForm.checkValidity();
}

createForm.addEventListener("input", updateCreateControls);

createForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  isCreating = true;
  updateCreateControls();
  setStatus(createStatus, "Creating Stripe customer...");
  customerResult.hidden = true;

  try {
    const customerReference = await createPaymentCustomer(
      inputReferenceEl.value
    );

    createdCustomerReference.value = customerReference;
    customerResult.hidden = false;
    setupCustomerReferenceEl.value = customerReference;
    customerReferenceEl.value = customerReference;
    confirmDeleteEl.checked = false;
    updateSetupIntentControls();
    updateDeleteControls();
    setStatus(createStatus, "Stripe customer created.");
  } catch (error) {
    console.error(error);
    setStatus(
      createStatus,
      error.message || "Could not create the Stripe customer.",
      true
    );
  } finally {
    isCreating = false;
    updateCreateControls();
  }
});

setupIntentForm.addEventListener("input", updateSetupIntentControls);

setupIntentForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  isCreatingSetupIntent = true;
  updateSetupIntentControls();
  setStatus(setupIntentStatus, "Creating Stripe SetupIntent...");
  clientSecretResult.hidden = true;

  try {
    const clientSecret = await createStripeSetupIntent(
      setupCustomerReferenceEl.value
    );

    setupIntentClientSecret.textContent = clientSecret;
    clientSecretResult.hidden = false;
    setStatus(setupIntentStatus, "Stripe SetupIntent created.");
  } catch (error) {
    console.error(error);
    setStatus(
      setupIntentStatus,
      error.message || "Could not create the Stripe SetupIntent.",
      true
    );
  } finally {
    isCreatingSetupIntent = false;
    updateSetupIntentControls();
  }
});

deleteForm.addEventListener("input", updateDeleteControls);
deleteForm.addEventListener("change", updateDeleteControls);

deleteForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!confirmDeleteEl.checked) {
    return;
  }

  isDeleting = true;
  updateDeleteControls();
  setStatus(deleteStatus, "Deleting Stripe customer...");

  try {
    const deletedReference = await deleteCustomer(
      customerReferenceEl.value
    );

    setStatus(
      deleteStatus,
      `Stripe customer ${deletedReference} was deleted.`
    );
    customerReferenceEl.value = "";
    confirmDeleteEl.checked = false;

    if (createdCustomerReference.value === deletedReference) {
      customerResult.hidden = true;
      createdCustomerReference.value = "";
    }
  } catch (error) {
    console.error(error);
    setStatus(
      deleteStatus,
      error.message || "Could not delete the Stripe customer.",
      true
    );
  } finally {
    isDeleting = false;
    updateDeleteControls();
  }
});

updateCreateControls();
updateSetupIntentControls();
updateDeleteControls();
await loadPaymentMode();
