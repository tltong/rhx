import {
  listSyllabusScopeCountries
} from "../../../syllabusscope/syllabusscope_module.js?v=20260829-subscription-plan-admin-v1";
import {
  createSubscriptionPlan,
  deleteSubscriptionPlan,
  getSubscriptionPlanCatalog,
  setSubscriptionPlanCurrency,
  updateSubscriptionPlan
} from "../../syllabus_subscription_module.js?v=20260912-stripe-product-name-v1";

const countryEl = document.querySelector("#subscription-plan-country");
const currencyFormEl = document.querySelector("#currency-form");
const currencyEl = document.querySelector("#subscription-plan-currency");
const saveCurrencyEl = document.querySelector("#save-currency");
const newPlanFormEl = document.querySelector("#new-plan-form");
const createPlanEl = document.querySelector("#create-plan");
const planListEl = document.querySelector("#subscription-plan-list");
const planCountEl = document.querySelector("#subscription-plan-count");
const statusEl = document.querySelector("#subscription-plan-status");

let selectedCountry = "";
let catalog = null;
let isBusy = false;

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("is-error", isError);
  statusEl.hidden = !message;
}

function updateControls() {
  const hasCountry = Boolean(selectedCountry);
  const hasCatalog = Boolean(catalog);

  countryEl.disabled = isBusy;
  currencyEl.disabled = isBusy || !hasCountry;
  saveCurrencyEl.disabled = isBusy
    || !hasCountry
    || !currencyFormEl.checkValidity();

  Array.from(newPlanFormEl.elements).forEach((element) => {
    element.disabled = isBusy || !hasCatalog;
  });
  createPlanEl.disabled = isBusy
    || !hasCatalog
    || !newPlanFormEl.checkValidity();

  planListEl.querySelectorAll("input, button").forEach((control) => {
    control.disabled = isBusy;
  });
  planListEl.querySelectorAll(".delete-button").forEach((button) => {
    const confirmation = button.closest(".delete-controls")
      ?.querySelector("input[type='checkbox']");

    button.disabled = isBusy || !confirmation?.checked;
  });
}

function setBusy(busy) {
  isBusy = busy;
  updateControls();
}

function createNumberInput(name, value, { min, step }) {
  const input = document.createElement("input");

  input.name = name;
  input.type = "number";
  input.min = String(min);
  input.step = String(step);
  input.value = String(value);
  input.required = true;
  input.addEventListener("input", updateControls);
  return input;
}

function createField(labelText, input) {
  const label = document.createElement("label");

  label.append(labelText, input);
  return label;
}

function renderPlans() {
  const plans = catalog?.plans || [];

  planListEl.replaceChildren();
  planCountEl.textContent = String(plans.length);

  if (plans.length === 0) {
    const empty = document.createElement("p");

    empty.className = "empty-message";
    empty.textContent = catalog
      ? "No subscription plans are configured for this country."
      : "Save a currency before adding subscription plans.";
    planListEl.append(empty);
    updateControls();
    return;
  }

  plans.forEach((plan) => {
    const row = document.createElement("article");
    const header = document.createElement("div");
    const title = document.createElement("h3");
    const planId = document.createElement("span");
    const fields = document.createElement("form");
    const nameInput = document.createElement("input");
    const stripeProductNameInput = document.createElement("input");
    const monthsInput = createNumberInput("months", plan.months, {
      min: 1,
      step: 1
    });
    const feeInput = createNumberInput("fee", plan.fee, {
      min: 0,
      step: 0.01
    });
    const saveButton = document.createElement("button");
    const deleteControls = document.createElement("div");
    const confirmationLabel = document.createElement("label");
    const confirmation = document.createElement("input");
    const deleteButton = document.createElement("button");

    row.className = "plan-row";
    header.className = "plan-row-header";
    title.textContent = plan.name;
    planId.className = "plan-id";
    planId.textContent = plan.id;
    header.append(title, planId);

    fields.className = "plan-row-fields";
    nameInput.name = "name";
    nameInput.type = "text";
    nameInput.maxLength = 120;
    nameInput.value = plan.name;
    nameInput.required = true;
    nameInput.addEventListener("input", updateControls);
    stripeProductNameInput.name = "stripeProductName";
    stripeProductNameInput.type = "text";
    stripeProductNameInput.maxLength = 250;
    stripeProductNameInput.value = plan.stripeProductName;
    stripeProductNameInput.required = true;
    stripeProductNameInput.addEventListener("input", updateControls);
    saveButton.type = "submit";
    saveButton.textContent = "Save Plan";
    fields.append(
      createField("Plan name", nameInput),
      createField("Stripe product name", stripeProductNameInput),
      createField("Months", monthsInput),
      createField("Fee", feeInput),
      saveButton
    );

    fields.addEventListener("submit", (event) => {
      event.preventDefault();

      if (!fields.reportValidity()) {
        return;
      }

      void runAction(
        `Saving ${plan.name}...`,
        async () => updateSubscriptionPlan({
          country: selectedCountry,
          planId: plan.id,
          name: nameInput.value,
          stripeProductName: stripeProductNameInput.value,
          months: Number(monthsInput.value),
          fee: Number(feeInput.value)
        }),
        "Subscription plan saved."
      );
    });

    deleteControls.className = "delete-controls";
    confirmation.type = "checkbox";
    confirmation.addEventListener("change", updateControls);
    confirmationLabel.append(confirmation, "Confirm deletion");
    deleteButton.type = "button";
    deleteButton.className = "delete-button";
    deleteButton.textContent = "Delete Plan";
    deleteButton.disabled = true;
    deleteButton.addEventListener("click", () => {
      void runAction(
        `Deleting ${plan.name}...`,
        () => deleteSubscriptionPlan(selectedCountry, plan.id),
        "Subscription plan deleted."
      );
    });
    deleteControls.append(confirmationLabel, deleteButton);

    row.append(header, fields, deleteControls);
    planListEl.append(row);
  });

  updateControls();
}

async function loadSelectedCountry(country, message = "") {
  selectedCountry = String(country ?? "").trim();
  catalog = null;
  currencyEl.value = "";
  setBusy(true);
  renderPlans();

  if (!selectedCountry) {
    setStatus("Select a country.");
    setBusy(false);
    return;
  }

  setStatus(`Loading plans for ${selectedCountry}...`);

  try {
    catalog = await getSubscriptionPlanCatalog(selectedCountry);
    currencyEl.value = catalog?.currency || "";
    renderPlans();
    setStatus(message || (
      catalog
        ? `${catalog.plans.length} subscription plan${catalog.plans.length === 1 ? "" : "s"} loaded.`
        : `Set the currency for ${selectedCountry} before adding plans.`
    ));
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Could not load subscription plans.", true);
  } finally {
    setBusy(false);
  }
}

async function runAction(progressMessage, action, successMessage) {
  if (isBusy) {
    return;
  }

  setBusy(true);
  setStatus(progressMessage);

  try {
    await action();
    await loadSelectedCountry(selectedCountry, successMessage);
  } catch (error) {
    console.error(error);
    setStatus(error.message || "The subscription plan update failed.", true);
    setBusy(false);
  }
}

function renderCountries(countries) {
  countryEl.replaceChildren();

  if (countries.length === 0) {
    const option = document.createElement("option");

    option.value = "";
    option.textContent = "No syllabus-scope countries";
    countryEl.append(option);
    return;
  }

  countries.forEach((country) => {
    const option = document.createElement("option");

    option.value = country;
    option.textContent = country;
    countryEl.append(option);
  });
}

currencyFormEl.addEventListener("input", updateControls);
newPlanFormEl.addEventListener("input", updateControls);

countryEl.addEventListener("change", () => {
  void loadSelectedCountry(countryEl.value);
});

currencyFormEl.addEventListener("submit", (event) => {
  event.preventDefault();

  if (!currencyFormEl.reportValidity()) {
    return;
  }

  void runAction(
    `Saving currency for ${selectedCountry}...`,
    () => setSubscriptionPlanCurrency(
      selectedCountry,
      currencyEl.value
    ),
    "Currency saved."
  );
});

newPlanFormEl.addEventListener("submit", (event) => {
  event.preventDefault();

  if (!newPlanFormEl.reportValidity()) {
    return;
  }

  const data = new FormData(newPlanFormEl);

  void runAction(
    "Adding subscription plan...",
    () => createSubscriptionPlan({
      country: selectedCountry,
      name: data.get("name"),
      stripeProductName: data.get("stripeProductName"),
      months: Number(data.get("months")),
      fee: Number(data.get("fee"))
    }),
    "Subscription plan added."
  ).then(() => {
    if (!statusEl.classList.contains("is-error")) {
      newPlanFormEl.reset();
      updateControls();
    }
  });
});

async function initializePage() {
  setBusy(true);
  setStatus("Loading syllabus-scope countries...");

  try {
    const countries = await listSyllabusScopeCountries();

    renderCountries(countries);

    if (countries.length === 0) {
      renderPlans();
      setStatus(
        "No countries are configured in Syllabus Scope Admin.",
        true
      );
      return;
    }

    countryEl.value = countries[0];
    setBusy(false);
    await loadSelectedCountry(countries[0]);
  } catch (error) {
    console.error(error);
    renderCountries([]);
    renderPlans();
    setStatus(error.message || "Could not load countries.", true);
  } finally {
    setBusy(false);
  }
}

void initializePage();
