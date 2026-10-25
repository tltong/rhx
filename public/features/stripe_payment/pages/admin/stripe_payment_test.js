import {
  confirmSetup,
  confirmSubscriptionPayment,
  createPaymentCustomer,
  createStripeSetupIntent,
  createStripeSubscription,
  deleteCustomer,
  getStripeSubscriptionPaymentAction,
  listStripeCustomers,
  mountSetupPaymentElement,
  retrieveSetupIntent
} from "../../stripe_payment_module.js?v=20261025-customer-select-v1";
import {
  getPaymentConfig
} from "../../../payment/payment_module.js?v=20260901-payment-config-simple-v1";
import {
  getCurrentFirebaseAuthUser,
  onFirebaseAuthStateChanged
} from "../../../../utils/firebase/firebase_auth.js";
import {
  listStudents
} from "../../../student/student_module.js?v=20260825-student-pin-v1";
import {
  getSubscriptionPlanCatalog
} from "../../../syllabus_subscription/subscription_plan_module.js?v=20260912-stripe-product-name-v1";

const CHECKOUT_STORAGE_KEY =
  "rhx.stripePaymentTest.checkoutState.v1";
const STRIPE_FLOW_PARAMETER = "stripeFlow";
const SUBSCRIPTION_REFERENCE_PARAMETER = "subscriptionReference";
const STRIPE_SETUP_FLOW = "setup";
const STRIPE_SUBSCRIPTION_PAYMENT_FLOW = "subscription-payment";
const STRIPE_RETURN_PARAMETERS = [
  "setup_intent",
  "setup_intent_client_secret",
  "payment_intent",
  "payment_intent_client_secret",
  "redirect_status"
];

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
const reloadStripeCustomersButton =
  document.querySelector("#reload-stripe-customers");
const stripeCustomerOptionsStatus =
  document.querySelector("#stripe-customer-options-status");
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
const confirmSetupForceRedirectEl =
  document.querySelector("#confirm-setup-force-redirect");
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
const reloadSubscriptionOptionsButton =
  document.querySelector("#reload-subscription-options");
const subscriptionOptionsStatus =
  document.querySelector("#subscription-options-status");
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
const confirmSubscriptionForceRedirectEl = document.querySelector(
  "#confirm-subscription-payment-force-redirect"
);
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
let isLoadingStudents = true;
let isLoadingPlans = true;
let studentsLoaded = false;
let plansCountry = null;
let planLoadVersion = 0;
let studentsMessage = "Loading students...";
let plansMessage = "Loading subscription plans...";
let studentsLoadFailed = false;
let plansLoadFailed = false;
let isLoadingCustomers = true;
let customersLoaded = false;
let customerLoadVersion = 0;

function setStatus(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle("is-error", isError);
  element.hidden = !message;
}

function stripeReturnUrl(flow, subscriptionReference = null) {
  const url = new URL(window.location.pathname, window.location.origin);

  url.searchParams.set(STRIPE_FLOW_PARAMETER, flow);

  if (subscriptionReference) {
    url.searchParams.set(
      SUBSCRIPTION_REFERENCE_PARAMETER,
      subscriptionReference
    );
  }

  return url.href;
}

function setupReturnUrl() {
  return stripeReturnUrl(STRIPE_SETUP_FLOW);
}

function subscriptionPaymentReturnUrl(subscriptionReference = null) {
  return stripeReturnUrl(
    STRIPE_SUBSCRIPTION_PAYMENT_FLOW,
    subscriptionReference
  );
}

function normalizeSubscriptionReference(value) {
  const reference = String(value ?? "").trim();

  if (
    !reference
    || !reference.startsWith("sub_")
    || reference.includes("/")
  ) {
    return null;
  }

  return reference;
}

function readStoredCheckoutState() {
  try {
    const value = window.sessionStorage.getItem(CHECKOUT_STORAGE_KEY);

    if (!value) {
      return null;
    }

    const state = JSON.parse(value);
    return state && typeof state === "object" && !Array.isArray(state)
      ? state
      : null;
  } catch (error) {
    console.warn("Could not read Stripe test checkout state.", error);
    return null;
  }
}

function removeStoredCheckoutState() {
  try {
    window.sessionStorage.removeItem(CHECKOUT_STORAGE_KEY);
  } catch (error) {
    console.warn("Could not remove Stripe test checkout state.", error);
  }
}

function saveCheckoutState(subscriptionReference = null) {
  const state = {
    studentId: subscriptionStudentIdEl.value.trim(),
    customerReference:
      subscriptionCustomerReferenceEl.value.trim()
      || setupCustomerReferenceEl.value.trim(),
    country: subscriptionCountryEl.value.trim(),
    planId: subscriptionPlanIdEl.value.trim(),
    idempotencyReference:
      subscriptionIdempotencyReferenceEl.value.trim(),
    subscriptionReference: normalizeSubscriptionReference(
      subscriptionReference
    )
  };

  try {
    window.sessionStorage.setItem(
      CHECKOUT_STORAGE_KEY,
      JSON.stringify(state)
    );
  } catch (error) {
    console.warn("Could not save Stripe test checkout state.", error);
  }
}

function restoreCheckoutState() {
  const state = readStoredCheckoutState();

  if (!state) {
    return null;
  }

  const customerReference = String(
    state.customerReference ?? ""
  ).trim();

  if (customerReference) {
    subscriptionCustomerReferenceEl.value = customerReference;
  }

  subscriptionCountryEl.value = String(state.country ?? "").trim();
  subscriptionIdempotencyReferenceEl.value = String(
    state.idempotencyReference ?? ""
  ).trim();

  return {
    customerReference,
    studentId: String(state.studentId ?? "").trim(),
    planId: String(state.planId ?? "").trim(),
    subscriptionReference: normalizeSubscriptionReference(
      state.subscriptionReference
    )
  };
}

function readStripeReturnState() {
  const url = new URL(window.location.href);

  return {
    flow: String(
      url.searchParams.get(STRIPE_FLOW_PARAMETER) ?? ""
    ).trim(),
    setupIntentClientSecret: String(
      url.searchParams.get("setup_intent_client_secret") ?? ""
    ).trim() || null,
    hasPaymentIntentReturn: Boolean(
      url.searchParams.get("payment_intent")
      || url.searchParams.get("payment_intent_client_secret")
      || url.searchParams.get("redirect_status")
    ),
    subscriptionReference: normalizeSubscriptionReference(
      url.searchParams.get(SUBSCRIPTION_REFERENCE_PARAMETER)
    )
  };
}

function cleanStripeReturnParameters() {
  const url = new URL(window.location.href);
  let changed = false;

  [STRIPE_FLOW_PARAMETER, ...STRIPE_RETURN_PARAMETERS].forEach(
    (parameter) => {
      if (url.searchParams.has(parameter)) {
        url.searchParams.delete(parameter);
        changed = true;
      }
    }
  );

  if (changed) {
    window.history.replaceState(
      null,
      "",
      url.pathname + url.search + url.hash
    );
  }
}

function waitForFirebaseAuthInitialization() {
  const currentUser = getCurrentFirebaseAuthUser();

  if (currentUser) {
    return Promise.resolve(currentUser);
  }

  return new Promise((resolve) => {
    let unsubscribe = null;

    unsubscribe = onFirebaseAuthStateChanged((authUser) => {
      resolve(authUser);
      queueMicrotask(() => unsubscribe?.());
    });
  });
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
  const isBusy = isCreating || isDeleting
    || isCreatingSubscription || isConfirmingSubscriptionPayment
    || isCreatingSetupIntent
    || isMountingPaymentElement
    || isConfirmingSetup;

  const contextMounted = Boolean(activeContextReference);
  setupCustomerReferenceEl.disabled = isBusy || contextMounted
    || isLoadingCustomers || !customersLoaded
    || setupCustomerReferenceEl.options.length < 2;
  reloadStripeCustomersButton.disabled = isBusy || contextMounted || isLoadingCustomers;
  createSetupIntentButton.disabled =
    setupCustomerReferenceEl.disabled || !setupCustomerReferenceEl.value
    || !setupIntentForm.checkValidity();
}

async function loadStripeCustomerChoices(selectedReference = "") {
  const version = ++customerLoadVersion;
  const previousReference = setupCustomerReferenceEl.value;
  isLoadingCustomers = true;
  customersLoaded = false;
  resetOptions(setupCustomerReferenceEl, "Loading Stripe customers...");
  setStatus(stripeCustomerOptionsStatus, "Loading Stripe customers...");
  updateSetupIntentControls();
  try {
    const result = await listStripeCustomers();
    if (version !== customerLoadVersion) return;
    resetOptions(setupCustomerReferenceEl, result.customers.length
      ? `Select a ${result.mode.toUpperCase()} Stripe customer` : "No registered Stripe customers");
    for (const customer of result.customers) {
      appendOption(setupCustomerReferenceEl, customer.customerReference,
        customer.email ? `${customer.email} (${customer.customerReference})` : customer.customerReference);
    }
    setupCustomerReferenceEl.value = result.customers.some(customer =>
      customer.customerReference === selectedReference) ? selectedReference : "";
    if (previousReference && previousReference !== setupCustomerReferenceEl.value) {
      resetSetupCustomer(setupCustomerReferenceEl.value);
    }
    customersLoaded = true;
    setStatus(stripeCustomerOptionsStatus, result.customers.length
      ? `Showing registered Stripe customers in ${result.mode.toUpperCase()} mode.`
      : `No Stripe customers are registered in ${result.mode.toUpperCase()} mode. Create one in Step 1.`);
  } catch (error) {
    if (version !== customerLoadVersion) return;
    console.error("Could not load Stripe customer choices.", error);
    resetOptions(setupCustomerReferenceEl, "Stripe customers unavailable");
    setStatus(stripeCustomerOptionsStatus,
      "Could not load Stripe customers. Use Reload customers to retry.", true);
  } finally {
    if (version === customerLoadVersion) {
      isLoadingCustomers = false;
      updateSetupIntentControls();
    }
  }
}

function selectSetupCustomer() {
  if (setupCustomerReferenceEl.disabled) return;
  resetSetupCustomer(setupCustomerReferenceEl.value);
}

function resetSetupCustomer(reference) {
  activeContextReference = null;
  subscriptionCustomerReferenceEl.value = reference;
  subscriptionPaymentMethodReferenceEl.value = "";
  subscriptionIdempotencyReferenceEl.value = createIdempotencyReference();
  subscriptionResult.hidden = true;
  clientSecretResult.hidden = true;
  setupIntentClientSecret.textContent = "";
  mountClientSecretEl.value = "";
  confirmContextReferenceEl.value = "";
  confirmSetupConsentEl.checked = false;
  setupContextResult.hidden = true;
  setupContextReference.textContent = "";
  setupContextMode.textContent = "";
  confirmedSetupResult.hidden = true;
  setStatus(setupIntentStatus, "");
  setStatus(confirmSetupStatus, "");
  resetSubscriptionPaymentConfirmation();
  saveCheckoutState();
  updateStripeSetupControls();
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
  confirmSetupForceRedirectEl.disabled = isConfirmingSetup;
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
    subscriptionIdempotencyReferenceEl
  ];

  fields.forEach((field) => {
    field.disabled = isBusy;
  });
  subscriptionStudentIdEl.disabled = isBusy || isLoadingStudents
    || !studentsLoaded || subscriptionStudentIdEl.options.length < 2;
  subscriptionPlanIdEl.disabled = isBusy || isLoadingPlans
    || plansCountry !== subscriptionCountryEl.value.trim()
    || subscriptionPlanIdEl.options.length < 2;
  reloadSubscriptionOptionsButton.disabled = isBusy
    || isLoadingStudents || isLoadingPlans;
  newSubscriptionAttemptButton.disabled = isBusy;
  createSubscriptionButton.disabled =
    isBusy || subscriptionStudentIdEl.disabled
    || subscriptionPlanIdEl.disabled
    || !subscriptionStudentIdEl.value || !subscriptionPlanIdEl.value
    || !createSubscriptionForm.checkValidity();
}

function renderSubscriptionOptionsStatus() {
  setStatus(
    subscriptionOptionsStatus,
    [studentsMessage, plansMessage].filter(Boolean).join(" "),
    studentsLoadFailed || plansLoadFailed
  );
  updateSubscriptionControls();
}

function resetOptions(select, placeholder) {
  const option = document.createElement("option");
  option.value = "";
  option.textContent = placeholder;
  select.replaceChildren(option);
}

function appendOption(select, value, label) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  select.append(option);
}

async function loadSubscriptionStudents(selectedId = "") {
  isLoadingStudents = true;
  studentsLoaded = false;
  studentsLoadFailed = false;
  studentsMessage = "Loading students...";
  resetOptions(subscriptionStudentIdEl, "Loading students...");
  renderSubscriptionOptionsStatus();
  try {
    const students = await listStudents();
    if (!Array.isArray(students)) throw new Error("Invalid student list.");
    resetOptions(subscriptionStudentIdEl, students.length
      ? "Select a student" : "No students available");
    for (const student of students) {
      const label = student.name || student.username;
      appendOption(subscriptionStudentIdEl, student.id,
        label ? `${label} (${student.id})` : student.id);
    }
    subscriptionStudentIdEl.value = students.some(student => student.id === selectedId)
      ? selectedId : "";
    studentsLoaded = true;
    studentsMessage = students.length ? "" : "No students are available.";
  } catch (error) {
    console.error("Could not load subscription students.", error);
    resetOptions(subscriptionStudentIdEl, "Students unavailable");
    studentsLoadFailed = true;
    studentsMessage = "Could not load students. Use Reload students and plans to retry.";
  } finally {
    isLoadingStudents = false;
    renderSubscriptionOptionsStatus();
  }
}

async function loadSubscriptionPlans(selectedId = "") {
  const version = ++planLoadVersion;
  const country = subscriptionCountryEl.value.trim();
  isLoadingPlans = Boolean(country);
  plansCountry = null;
  plansLoadFailed = false;
  plansMessage = country ? "Loading subscription plans..."
    : "Enter a country to load subscription plans.";
  resetOptions(subscriptionPlanIdEl, country
    ? "Loading subscription plans..." : "Enter a country first");
  renderSubscriptionOptionsStatus();
  if (!country) return;
  try {
    const catalog = await getSubscriptionPlanCatalog(country);
    if (version !== planLoadVersion) return;
    const plans = catalog?.plans || [];
    if (!Array.isArray(plans)) throw new Error("Invalid subscription plan list.");
    resetOptions(subscriptionPlanIdEl, plans.length
      ? "Select a subscription plan" : "No plans available");
    for (const plan of plans) {
      const term = `${plan.months} month${plan.months === 1 ? "" : "s"}`;
      const price = [catalog.currency, Number(plan.fee).toFixed(2)].join(" ");
      appendOption(subscriptionPlanIdEl, plan.id,
        `${plan.name} — ${term} — ${price} (${plan.id})`);
    }
    subscriptionPlanIdEl.value = plans.some(plan => plan.id === selectedId)
      ? selectedId : "";
    plansCountry = country;
    plansMessage = plans.length ? ""
      : `No subscription plans are configured for ${country}.`;
  } catch (error) {
    if (version !== planLoadVersion) return;
    console.error("Could not load subscription plans.", error);
    resetOptions(subscriptionPlanIdEl, "Plans unavailable");
    plansLoadFailed = true;
    plansMessage = "Could not load plans. Use Reload students and plans to retry.";
  } finally {
    if (version === planLoadVersion) {
      isLoadingPlans = false;
      renderSubscriptionOptionsStatus();
    }
  }
}

function loadSubscriptionChoices({studentId = "", planId = ""} = {}) {
  return Promise.all([
    loadSubscriptionStudents(studentId),
    loadSubscriptionPlans(planId)
  ]);
}

function updateSubscriptionPaymentConfirmationControls() {
  const isBusy = isCreatingSubscription
    || isConfirmingSubscriptionPayment;

  confirmSubscriptionClientSecretEl.disabled = isBusy;
  confirmSubscriptionReturnUrlEl.disabled = isBusy;
  confirmSubscriptionForceRedirectEl.disabled = isBusy;
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

function renderRecoveredSetupStatus(outcome) {
  const isError = outcome.status === "requires_payment_method"
    || outcome.status === "canceled";
  let message = `Stripe SetupIntent status: ${outcome.status}.`;

  if (outcome.status === "succeeded") {
    message =
      "Stripe setup recovered after redirect and PaymentMethod returned.";
  } else if (outcome.status === "requires_payment_method") {
    message =
      "Stripe setup failed. Create a new SetupIntent and enter another " +
      "payment method.";
  } else if (outcome.status === "processing") {
    message = "Stripe is still processing the payment method setup.";
  }

  setStatus(confirmSetupStatus, message, isError);
}

async function resumeSetupRedirect(clientSecret) {
  setStatus(
    confirmSetupStatus,
    "Recovering Stripe setup after redirect..."
  );
  confirmedSetupResult.hidden = true;

  try {
    const outcome = await retrieveSetupIntent({clientSecret});

    renderConfirmedSetup(outcome);
    renderRecoveredSetupStatus(outcome);
    activeContextReference = null;
  } catch (error) {
    console.error("Could not recover Stripe setup after redirect.", error);
    setStatus(
      confirmSetupStatus,
      error.message || "Could not recover the Stripe setup.",
      true
    );
  } finally {
    updateStripeSetupControls();
  }
}

function renderRecoveredSubscriptionPayment(action) {
  const paymentStatus = action.paymentStatus || action.action;
  const subscriptionReference = action.subscriptionReference;
  let message = `Stripe PaymentIntent status: ${paymentStatus}.`;
  let isError = false;

  createdSubscriptionReference.textContent = subscriptionReference;
  subscriptionResult.hidden = false;
  confirmedSubscriptionPaymentStatus.textContent = paymentStatus;
  confirmedSubscriptionResult.hidden = false;
  confirmSubscriptionClientSecretEl.value =
    action.paymentClientSecret || "";
  confirmSubscriptionReturnUrlEl.value =
    subscriptionPaymentReturnUrl(subscriptionReference);

  switch (action.action) {
    case "complete":
      message =
        "Stripe subscription payment completed. The invoice.paid " +
        "webhook will update the RHX subscription.";
      removeStoredCheckoutState();
      break;

    case "confirm_payment":
      message =
        "Stripe still requires payment authentication. The payment " +
        "client secret has been restored for another attempt.";
      break;

    case "wait":
      message = "Stripe is still processing the subscription payment.";
      break;

    case "replace_payment_method":
      message =
        "Stripe requires another payment method. Return to the card " +
        "setup steps and enter another card.";
      isError = true;
      break;

    default:
      message =
        "The Stripe subscription payment cannot currently be completed.";
      isError = true;
  }

  setStatus(confirmSubscriptionStatus, message, isError);
  updateStripeSetupControls();
}

async function resumeSubscriptionPaymentRedirect(subscriptionReference) {
  setStatus(
    confirmSubscriptionStatus,
    "Checking Stripe subscription payment after redirect..."
  );
  confirmedSubscriptionResult.hidden = true;

  try {
    const authUser = await waitForFirebaseAuthInitialization();

    if (!authUser) {
      throw new Error(
        "Sign in as the subscription owner to recover this payment."
      );
    }

    const action = await getStripeSubscriptionPaymentAction(
      subscriptionReference
    );

    renderRecoveredSubscriptionPayment(action);
  } catch (error) {
    console.error(
      "Could not recover Stripe subscription payment after redirect.",
      error
    );
    setStatus(
      confirmSubscriptionStatus,
      error.message
        || "Could not recover the Stripe subscription payment.",
      true
    );
  } finally {
    updateStripeSetupControls();
  }
}

async function resumeStripeRedirect(returnState, storedCheckoutState) {
  const isSetupReturn = Boolean(returnState.setupIntentClientSecret);
  const isSubscriptionPaymentReturn =
    returnState.hasPaymentIntentReturn
    || returnState.flow === STRIPE_SUBSCRIPTION_PAYMENT_FLOW;

  if (!isSetupReturn && !isSubscriptionPaymentReturn) {
    return;
  }

  cleanStripeReturnParameters();

  if (isSetupReturn) {
    await resumeSetupRedirect(returnState.setupIntentClientSecret);
    return;
  }

  const subscriptionReference =
    returnState.subscriptionReference
    || storedCheckoutState?.subscriptionReference
    || null;

  if (!subscriptionReference) {
    setStatus(
      confirmSubscriptionStatus,
      "Stripe returned from payment authentication without a " +
        "subscription reference.",
      true
    );
    return;
  }

  await resumeSubscriptionPaymentRedirect(subscriptionReference);
}

createForm.addEventListener("input", updateCreateControls);

createForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  isCreating = true;
  updateCreateControls();
  updateSetupIntentControls();
  setStatus(createStatus, "Creating Stripe customer...");
  customerResult.hidden = true;

  try {
    const customerReference = await createPaymentCustomer(
      inputReferenceEl.value,
      customerEmailEl.value
    );

    createdCustomerReference.value = customerReference;
    customerResult.hidden = false;
    removeStoredCheckoutState();
    subscriptionCustomerReferenceEl.value = customerReference;
    subscriptionPaymentMethodReferenceEl.value = "";
    subscriptionIdempotencyReferenceEl.value =
      createIdempotencyReference();
    subscriptionResult.hidden = true;
    resetSubscriptionPaymentConfirmation();
    customerReferenceEl.value = customerReference;
    confirmDeleteEl.checked = false;
    await loadStripeCustomerChoices(customerReference);
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
    updateSetupIntentControls();
  }
});

setupIntentForm.addEventListener("input", updateSetupIntentControls);
setupCustomerReferenceEl.addEventListener("change", selectSetupCustomer);
reloadStripeCustomersButton.addEventListener("click", () => {
  if (!reloadStripeCustomersButton.disabled) {
    loadStripeCustomerChoices(setupCustomerReferenceEl.value);
  }
});

setupIntentForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  updateSetupIntentControls();
  if (createSetupIntentButton.disabled) return;
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
    saveCheckoutState();
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
    saveCheckoutState();

    const outcome = await confirmSetup({
      contextReference: confirmContextReferenceEl.value,
      returnUrl: confirmReturnUrlEl.value,
      redirectBehavior: confirmSetupForceRedirectEl.checked
        ? "always"
        : "if_required"
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
createSubscriptionForm.addEventListener("change", updateSubscriptionControls);

subscriptionCountryEl.addEventListener("input", () => {
  planLoadVersion++;
  isLoadingPlans = false;
  plansCountry = null;
  plansLoadFailed = false;
  plansMessage = "Finish entering the country to load its subscription plans.";
  resetOptions(subscriptionPlanIdEl, "Enter a country first");
  renderSubscriptionOptionsStatus();
});
subscriptionCountryEl.addEventListener("change", () => loadSubscriptionPlans());
reloadSubscriptionOptionsButton.addEventListener("click", () => {
  if (reloadSubscriptionOptionsButton.disabled) return;
  loadSubscriptionChoices({
    studentId: subscriptionStudentIdEl.value,
    planId: subscriptionPlanIdEl.value
  });
});

newSubscriptionAttemptButton.addEventListener("click", () => {
  subscriptionIdempotencyReferenceEl.value = createIdempotencyReference();
  confirmSubscriptionReturnUrlEl.value = subscriptionPaymentReturnUrl();
  subscriptionResult.hidden = true;
  setStatus(createSubscriptionStatus, "");
  resetSubscriptionPaymentConfirmation();
  saveCheckoutState();
  updateSubscriptionControls();
});

createSubscriptionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  updateSubscriptionControls();
  if (createSubscriptionButton.disabled) return;
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
    confirmSubscriptionReturnUrlEl.value =
      subscriptionPaymentReturnUrl(result.subscriptionReference);
    confirmSubscriptionConsentEl.checked = false;
    saveCheckoutState(result.subscriptionReference);
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
    const subscriptionReference = normalizeSubscriptionReference(
      createdSubscriptionReference.textContent
    ) || readStoredCheckoutState()?.subscriptionReference || null;

    saveCheckoutState(subscriptionReference);

    const {paymentStatus} = await confirmSubscriptionPayment({
      paymentClientSecret: confirmSubscriptionClientSecretEl.value,
      returnUrl: confirmSubscriptionReturnUrlEl.value,
      redirectBehavior: confirmSubscriptionForceRedirectEl.checked
        ? "always"
        : "if_required"
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

    if (paymentStatus === "succeeded") {
      removeStoredCheckoutState();
    }
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
  updateSetupIntentControls();
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
    await loadStripeCustomerChoices(setupCustomerReferenceEl.value === deletedReference
      ? "" : setupCustomerReferenceEl.value);

    if (createdCustomerReference.value === deletedReference) {
      customerResult.hidden = true;
      createdCustomerReference.value = "";
      removeStoredCheckoutState();
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
    updateStripeSetupControls();
  }
});

const stripeReturnState = readStripeReturnState();
const storedCheckoutState = restoreCheckoutState();
const returnedSubscriptionReference =
  stripeReturnState.subscriptionReference
  || storedCheckoutState?.subscriptionReference
  || null;

confirmReturnUrlEl.value = setupReturnUrl();
confirmSubscriptionReturnUrlEl.value = subscriptionPaymentReturnUrl(
  returnedSubscriptionReference
);

if (!subscriptionIdempotencyReferenceEl.value.trim()) {
  subscriptionIdempotencyReferenceEl.value =
    createIdempotencyReference();
}

loadCurrentUserEmail();
updateStripeSetupControls();
updateDeleteControls();
const subscriptionChoicesReady = loadSubscriptionChoices(
  storedCheckoutState || {}
);
const stripeCustomersReady = loadStripeCustomerChoices(
  storedCheckoutState?.customerReference || ""
);
await loadPaymentMode();
await resumeStripeRedirect(stripeReturnState, storedCheckoutState);
await Promise.all([subscriptionChoicesReady, stripeCustomersReady]);
