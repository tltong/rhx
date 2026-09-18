import {
  getPaymentConfig,
  paymentModes,
  paymentProviders,
  savePaymentConfig
} from "../../payment_module.js?v=20260915-payment-provider-enum-v1";

const formEl = document.querySelector("#payment-config-form");
const providerEl = document.querySelector("#payment-provider");
const modeEl = document.querySelector("#payment-mode");
const customDataEl = document.querySelector("#payment-custom-data");
const saveButtonEl = document.querySelector("#save-payment-config");
const statusEl = document.querySelector("#payment-config-status");
const currentModeEl = document.querySelector("#current-mode");
const updatedAtEl = document.querySelector("#updated-at");


let isBusy = false;

function formatMode(mode) {
  return mode.charAt(0).toUpperCase() + mode.slice(1);
}

function formatProvider(provider) {
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

function populateProviderOptions() {
  providerEl.replaceChildren();

  Object.values(paymentProviders).forEach((provider) => {
    const option = document.createElement("option");

    option.value = provider;
    option.textContent = formatProvider(provider);
    providerEl.append(option);
  });
}

function populateModeOptions() {
  modeEl.replaceChildren();

  Object.values(paymentModes).forEach((mode) => {
    const option = document.createElement("option");

    option.value = mode;
    option.textContent = formatMode(mode);
    modeEl.append(option);
  });
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("is-error", isError);
  statusEl.hidden = !message;
}

function updateControls() {
  Array.from(formEl.elements).forEach((element) => {
    element.disabled = isBusy;
  });
  saveButtonEl.disabled = isBusy || !formEl.checkValidity();
}

function setBusy(busy) {
  isBusy = busy;
  updateControls();
}

function timestampToDate(value) {
  if (value instanceof Date) {
    return value;
  }

  if (typeof value?.toDate === "function") {
    return value.toDate();
  }

  return null;
}

function renderUpdatedAt(value) {
  const date = timestampToDate(value);

  updatedAtEl.textContent = date
    ? `Updated ${date.toLocaleString()}`
    : "Never saved";
}


function renderConfig(config) {
  providerEl.value = config?.provider || paymentProviders.STRIPE;
  modeEl.value = config?.mode || paymentModes.TEST;
  customDataEl.value = JSON.stringify(config?.customData || {}, null, 2);
  currentModeEl.textContent = config
    ? formatMode(config.mode)
    : "Not configured";
  renderUpdatedAt(config?.updatedAt);
  updateControls();
}


function parseCustomData() {
  const source = customDataEl.value.trim() || "{}";
  let customData;

  try {
    customData = JSON.parse(source);
  } catch {
    throw new Error("Custom data must contain valid JSON.");
  }

  if (!customData || typeof customData !== "object" || Array.isArray(customData)) {
    throw new Error("Custom data must be a JSON object.");
  }

  return customData;
}

function getFormInput() {
  return {
    provider: providerEl.value,
    mode: modeEl.value,

    customData: parseCustomData()
  };
}

async function loadConfig() {
  setBusy(true);
  setStatus("Loading payment configuration...");

  try {
    const config = await getPaymentConfig();

    renderConfig(config);
    setStatus(
      config
        ? "Payment configuration loaded."
        : "No payment configuration has been saved yet."
    );
  } catch (error) {
    console.error(error);
    setStatus(
      error.message || "Could not load payment configuration.",
      true
    );
  } finally {
    setBusy(false);
  }
}

formEl.addEventListener("input", updateControls);
formEl.addEventListener("change", updateControls);

formEl.addEventListener("submit", async (event) => {
  event.preventDefault();
  setBusy(true);
  setStatus("Saving payment configuration...");

  try {
    const savedConfig = await savePaymentConfig(getFormInput());

    renderConfig(savedConfig);
    setStatus("Payment configuration saved.");
  } catch (error) {
    console.error(error);
    setStatus(
      error.message || "Could not save payment configuration.",
      true
    );
  } finally {
    setBusy(false);
  }
});

populateProviderOptions();
populateModeOptions();
renderConfig(null);
await loadConfig();
