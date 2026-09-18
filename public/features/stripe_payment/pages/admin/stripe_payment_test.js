import {
  confirmSetup,
  confirmSubscriptionPayment,
  createPaymentCustomer,
  createStripeSetupIntent,
  createStripeSubscription,
  deleteCustomer,
  mountSetupPaymentElement
} from "../../stripe_payment_module.js?v=20260917-student-link-v1";
import {
  getPaymentConfig
} from "../../../payment/payment_module.js?v=20260901-payment-config-simple-v1";
import {
  getCurrentFirebaseAuthUser
} from "../../../../utils/firebase/firebase_auth.js";

const createForm = document.querySelector("#create-customer-form");
const inputReferenceEl = document.querySelector("#input-reference");
const customerEmailEl = document.querySelector("#customer-email");
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
const setupIntentStatus = document.querySelector("#setup-intent-status");
const clientSecretResult = document.querySelector("#client-secret-result");
const setupIntentClientSecret =
  document.querySelector("#setup-intent-client-secret");

const mountPaymentElementForm =
  document.querySelector("#mount-payment-element-form");
const mountClientSecretEl = document.querySelector("#mount-client-secret");
const containerSelectorEl =
  document.querySelector("#payment-element-container-selector");
const mountPaymentElementButton =
  document.querySelector("#mount-payment-element-button");
const mountPaymentElementStatus =
  document.querySelector("#mount-payment-element-status");
const setupContextResult = document.querySelector("#setup-context-result");
const setupContextReference =
  document.querySelector("#setup-context-reference");
const setupContextMode = document.querySelector("#setup-context-mode");

const confirmSetupForm = document.querySelector("#confirm-setup-form");
const confirmContextReferenceEl =
  document.querySelector("#confirm-context-reference");
const confirmReturnUrlEl = document.querySelector("#confirm-return-url");
const confirmSetupConsentEl =
  document.querySelector("#confirm-setup-consent");
const confirmSetupButton = document.querySelector("#confirm-setup-button");
const confirmSetupStatus = document.querySelector("#confirm-setup-status");
const confirmedSetupResult =
  document.querySelector("#confirmed-setup-result");
const confirmedSetupIntentReference =
  document.querySelector("#confirmed-setup-intent-reference");
const confirmedSetupStatus =
  document.querySelector("#confirmed-setup-status");
const confirmedPaymentMethodReference =
  document.querySelector("#confirmed-payment-method-reference");

const createSubscriptionForm =
  document.querySelector("#create-subscription-form");
const subscriptionStudentIdEl =
  document.querySelector("#subscription-student-id");
const subscriptionCustomerReferenceEl =
  document.querySelector("#subscription-customer-reference");
const subscriptionPaymentMethodReferenceEl =
  document.querySelector("#subscription-payment-method-reference");
const subscriptionCountryEl =
  document.querySelector("#subscription-country");
const subscriptionPlanIdEl =
  document.querySelector("#subscription-plan-id");
const subscriptionIdempotencyReferenceEl =
  document.querySelector("#subscription-idempotency-reference");
const newSubscriptionAttemptButton =
  document.querySelector("#new-subscription-attempt-button");
const createSubscriptionButton =
  document.querySelector("#create-subscription-button");
const createSubscriptionStatus =
  document.querySelector("#create-subscription-status");
const subscriptionResult = document.querySelector("#subscription-result");
const createdSubscriptionReference =
  document.querySelector("#created-subscription-reference");
const createdSubscriptionStatus =
  document.querySelector("#created-subscription-status");
const subscriptionPaymentClientSecret =
  document.querySelector("#subscription-payment-client-secret");

const confirmSubscriptionForm =
  document.querySelector("#confirm-subscription-payment-form");
const confirmSubscriptionClientSecretEl =
  document.querySelector(
    "#confirm-subscription-payment-client-secret"
  );
const confirmSubscriptionReturnUrlEl =
  document.querySelector("#confirm-subscription-payment-return-url");
const confirmSubscriptionConsentEl =
  document.querySelector("#confirm-subscription-payment-consent");
const confirmSubscriptionButton =
  document.querySelector("#confirm-subscription-payment-button");
const confirmSubscriptionStatus =
  document.querySelector("#confirm-subscription-payment-status");
const confirmedSubscriptionResult =
  document.querySelector("#confirmed-subscription-payment-result");
const confirmedSubscriptionPaymentStatus =
  document.querySelector("#confirmed-subscription-payment-status");

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
let isMountingPaymentElement = false;
let activeContextReference = null;
let isConfirmingSetup = false;
let isCreatingSubscription = false;
let isConfirmingSubscriptionPayment = false;
let isDeleting = false;

function setStatus(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle("is-error", isError);
  element.hidden = !message;
}

function currentPageReturnUrl() {
  const url = new URL(window.location.href);

  url.searchParams.delete("setup_intent");
  url.searchParams.delete("setup_intent_client_secret");
  url.searchParams.delete("payment_intent");
  url.searchParams.delete("payment_intent_client_secret");
  url.searchParams.delete("redirect_status");
  url.hash = "";
  return url.href;
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
  customerEmailEl.disabled = isCreating;
  createButton.disabled = isCreating || !createForm.checkValidity();
}

function loadCurrentUserEmail() {
  const currentUser = getCurrentFirebaseAuthUser();

  if (!inputReferenceEl.value.trim() && currentUser?.uid) {
    inputReferenceEl.value = currentUser.uid;
  }

  if (!customerEmailEl.value.trim() && currentUser?.email) {
    customerEmailEl.value = currentUser.email;
  }

  updateCreateControls();
}

function updateSetupIntentControls() {
  const isBusy = isCreatingSetupIntent
    || isMountingPaymentElement
    || isConfirmingSetup;

  setupCustomerReferenceEl.disabled = isBusy;
  createSetupIntentButton.disabled =
    isBusy || Boolean(activeContextReference)
    || !setupIntentForm.checkValidity();
}

function updateMountControls() {
  const isBusy = isMountingPaymentElement || isConfirmingSetup;

  mountClientSecretEl.disabled = isBusy;
  containerSelectorEl.disabled = isBusy;
  mountPaymentElementButton.disabled =
    isBusy || Boolean(activeContextReference)
    || !mountPaymentElementForm.checkValidity();
}

function updateConfirmControls() {
  confirmContextReferenceEl.disabled = isConfirmingSetup;
  confirmReturnUrlEl.disabled = isConfirmingSetup;
  confirmSetupConsentEl.disabled = isConfirmingSetup;
  confirmSetupButton.disabled =
    isConfirmingSetup || !confirmSetupForm.checkValidity();
}

function createIdempotencyReference() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `subscription-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function updateSubscriptionControls() {
  const isBusy = isCreatingSubscription
    || isConfirmingSubscriptionPayment;
  const fields = [
    subscriptionCustomerReferenceEl,
    subscriptionPaymentMethodReferenceEl,
    subscriptionCountryEl,
    subscriptionPlanIdEl,
    subscriptionIdempotencyReferenceEl
  ];

  fields.forEach((field) => {
    field.disabled = isBusy;
  });
  newSubscriptionAttemptButton.disabled = isBusy;
  createSubscriptionButton.disabled =
    isBusy || !createSubscriptionForm.checkValidity();
}

function updateSubscriptionPaymentConfirmationControls() {
  const isBusy = isCreatingSubscription
    || isConfirmingSubscriptionPayment;

  confirmSubscriptionClientSecretEl.disabled = isBusy;
  confirmSubscriptionReturnUrlEl.disabled = isBusy;
  confirmSubscriptionConsentEl.disabled = isBusy;
  confirmSubscriptionButton.disabled =
    isBusy || !confirmSubscriptionForm.checkValidity();
}

function resetSubscriptionPaymentConfirmation() {
  confirmSubscriptionClientSecretEl.value = "";
  confirmSubscriptionConsentEl.checked = false;
  confirmedSubscriptionResult.hidden = true;
  setStatus(confirmSubscriptionStatus, "");
  updateSubscriptionPaymentConfirmationControls();
}

function updateDeleteControls() {
  customerReferenceEl.disabled = isDeleting;
  confirmDeleteEl.disabled = isDeleting;
  deleteButton.disabled =
    isDeleting
    || !deleteForm.checkValidity()
    || !confirmDeleteEl.checked;
}

function updateStripeSetupControls() {
  updateSetupIntentControls();
  updateMountControls();
  updateConfirmControls();
  updateSubscriptionControls();
  updateSubscriptionPaymentConfirmationControls();
}

function renderConfirmedSetup(outcome) {
  confirmedSetupIntentReference.textContent = outcome.setupIntentReference;
  confirmedSetupStatus.textContent = outcome.status;
  confirmedPaymentMethodReference.textContent =
    outcome.paymentMethodReference || "Not returned";

  if (outcome.paymentMethodReference) {
    subscriptionPaymentMethodReferenceEl.value =
      outcome.paymentMethodReference;
  }

  confirmedSetupResult.hidden = false;
  updateSubscriptionControls();
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
      inputReferenceEl.value,
      customerEmailEl.value
    );

    createdCustomerReference.value = customerReference;
    customerResult.hidden = false;
    setupCustomerReferenceEl.value = customerReference;
    subscriptionCustomerReferenceEl.value = customerReference;
    subscriptionPaymentMethodReferenceEl.value = "";
    subscriptionIdempotencyReferenceEl.value =
      createIdempotencyReference();
    subscriptionResult.hidden = true;
    resetSubscriptionPaymentConfirmation();
    customerReferenceEl.value = customerReference;
    confirmDeleteEl.checked = false;
    updateStripeSetupControls();
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
  updateStripeSetupControls();
  setStatus(setupIntentStatus, "Creating Stripe SetupIntent...");
  clientSecretResult.hidden = true;

  try {
    const clientSecret = await createStripeSetupIntent(
      setupCustomerReferenceEl.value
    );

    setupIntentClientSecret.textContent = clientSecret;
    mountClientSecretEl.value = clientSecret;
    subscriptionCustomerReferenceEl.value =
      setupCustomerReferenceEl.value.trim();
    subscriptionPaymentMethodReferenceEl.value = "";
    subscriptionIdempotencyReferenceEl.value =
      createIdempotencyReference();
    subscriptionResult.hidden = true;
    resetSubscriptionPaymentConfirmation();
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
    updateStripeSetupControls();
  }
});

mountPaymentElementForm.addEventListener("input", updateMountControls);

mountPaymentElementForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  isMountingPaymentElement = true;
  updateStripeSetupControls();
  setStatus(mountPaymentElementStatus, "Mounting Stripe Payment Element...");
  setupContextResult.hidden = true;
  confirmedSetupResult.hidden = true;

  try {
    const result = await mountSetupPaymentElement({
      clientSecret: mountClientSecretEl.value,
      containerSelector: containerSelectorEl.value
    });

    activeContextReference = result.contextReference;
    setupContextReference.textContent = result.contextReference;
    setupContextMode.textContent = result.mode.toUpperCase();
    confirmContextReferenceEl.value = result.contextReference;
    setupContextResult.hidden = false;
    setStatus(
      mountPaymentElementStatus,
      "Stripe Payment Element mounted. Enter test payment details."
    );
  } catch (error) {
    console.error(error);
    setStatus(
      mountPaymentElementStatus,
      error.message || "Could not mount the Stripe Payment Element.",
      true
    );
  } finally {
    isMountingPaymentElement = false;
    updateStripeSetupControls();
  }
});

confirmSetupForm.addEventListener("input", updateConfirmControls);
confirmSetupForm.addEventListener("change", updateConfirmControls);

confirmSetupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  isConfirmingSetup = true;
  updateStripeSetupControls();
  setStatus(confirmSetupStatus, "Confirming setup with Stripe...");
  confirmedSetupResult.hidden = true;

  try {
    const outcome = await confirmSetup({
      contextReference: confirmContextReferenceEl.value,
      returnUrl: confirmReturnUrlEl.value
    });

    renderConfirmedSetup(outcome);

    if (outcome.status === "succeeded" || outcome.status === "canceled") {
      if (activeContextReference === confirmContextReferenceEl.value.trim()) {
        activeContextReference = null;
      }
    }

    setStatus(
      confirmSetupStatus,
      outcome.status === "succeeded"
        ? "Stripe setup confirmed and PaymentMethod returned."
        : `Stripe SetupIntent status: ${outcome.status}.`,
      outcome.status === "requires_payment_method"
        || outcome.status === "canceled"
    );
  } catch (error) {
    console.error(error);
    setStatus(
      confirmSetupStatus,
      error.message || "Could not confirm the Stripe setup.",
      true
    );
  } finally {
    isConfirmingSetup = false;
    updateStripeSetupControls();
  }
});

createSubscriptionForm.addEventListener(
  "input",
  updateSubscriptionControls
);

newSubscriptionAttemptButton.addEventListener("click", () => {
  subscriptionIdempotencyReferenceEl.value = createIdempotencyReference();
  subscriptionResult.hidden = true;
  setStatus(createSubscriptionStatus, "");
  resetSubscriptionPaymentConfirmation();
  updateSubscriptionControls();
});

createSubscriptionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  isCreatingSubscription = true;
  updateSubscriptionControls();
  setStatus(
    createSubscriptionStatus,
    "Creating Stripe subscription..."
  );
  subscriptionResult.hidden = true;
  resetSubscriptionPaymentConfirmation();

  try {
    const result = await createStripeSubscription({
      studentId: subscriptionStudentIdEl.value,
      customerReference: subscriptionCustomerReferenceEl.value,
      paymentMethodReference: subscriptionPaymentMethodReferenceEl.value,
      country: subscriptionCountryEl.value,
      planId: subscriptionPlanIdEl.value,
      idempotencyReference: subscriptionIdempotencyReferenceEl.value
    });

    createdSubscriptionReference.textContent =
      result.subscriptionReference;
    createdSubscriptionStatus.textContent = result.status;
    subscriptionPaymentClientSecret.textContent =
      result.paymentClientSecret || "Not returned";
    subscriptionResult.hidden = false;
    confirmSubscriptionClientSecretEl.value =
      result.paymentClientSecret || "";
    confirmSubscriptionConsentEl.checked = false;
    updateSubscriptionPaymentConfirmationControls();
    setStatus(
      createSubscriptionStatus,
      "Stripe subscription created."
    );
  } catch (error) {
    console.error(error);
    setStatus(
      createSubscriptionStatus,
      error.message || "Could not create the Stripe subscription.",
      true
    );
  } finally {
    isCreatingSubscription = false;
    updateStripeSetupControls();
  }
});

confirmSubscriptionForm.addEventListener(
  "input",
  updateSubscriptionPaymentConfirmationControls
);
confirmSubscriptionForm.addEventListener(
  "change",
  updateSubscriptionPaymentConfirmationControls
);

confirmSubscriptionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  isConfirmingSubscriptionPayment = true;
  updateStripeSetupControls();
  setStatus(
    confirmSubscriptionStatus,
    "Confirming Stripe subscription payment..."
  );
  confirmedSubscriptionResult.hidden = true;

  try {
    const {paymentStatus} = await confirmSubscriptionPayment({
      paymentClientSecret: confirmSubscriptionClientSecretEl.value,
      returnUrl: confirmSubscriptionReturnUrlEl.value
    });

    confirmedSubscriptionPaymentStatus.textContent = paymentStatus;
    confirmedSubscriptionResult.hidden = false;
    confirmSubscriptionConsentEl.checked = false;

    const isIncomplete = paymentStatus !== "succeeded"
      && paymentStatus !== "processing";
    const message = paymentStatus === "succeeded"
      ? "Stripe subscription payment confirmed."
      : paymentStatus === "processing"
        ? "Stripe subscription payment is processing."
        : `Stripe PaymentIntent status: ${paymentStatus}.`;

    setStatus(confirmSubscriptionStatus, message, isIncomplete);
  } catch (error) {
    console.error(error);
    setStatus(
      confirmSubscriptionStatus,
      error.message || "Could not confirm the subscription payment.",
      true
    );
  } finally {
    isConfirmingSubscriptionPayment = false;
    updateStripeSetupControls();
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

    if (
      subscriptionCustomerReferenceEl.value.trim() === deletedReference
    ) {
      subscriptionCustomerReferenceEl.value = "";
      subscriptionPaymentMethodReferenceEl.value = "";
      subscriptionResult.hidden = true;
      setStatus(createSubscriptionStatus, "");
      resetSubscriptionPaymentConfirmation();
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
    updateSubscriptionControls();
  }
});

confirmReturnUrlEl.value = currentPageReturnUrl();
confirmSubscriptionReturnUrlEl.value = currentPageReturnUrl();
subscriptionIdempotencyReferenceEl.value = createIdempotencyReference();
loadCurrentUserEmail();
updateStripeSetupControls();
updateDeleteControls();
await loadPaymentMode();
