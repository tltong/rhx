import {
  confirmSubscriptionPayment,
  getStripeSubscriptionPaymentAction
} from "../../stripe_payment_module.js?v=20261031-initial-confirm-v1";
import {
  onFirebaseAuthStateChanged
} from "../../../../utils/firebase/firebase_auth.js";

const HOME_URL = "/index.html";
const SUBSCRIPTION_QUERY_PARAMETER = "subscriptionReference";
const STRIPE_RETURN_PARAMETERS = [
  "payment_intent",
  "payment_intent_client_secret",
  "redirect_status"
];

const paymentCard = document.querySelector("#payment-card");
const paymentHeading = document.querySelector("#payment-heading");
const paymentStatus = document.querySelector("#payment-status");
const signInPanel = document.querySelector("#sign-in-panel");
const paymentSummary = document.querySelector("#payment-summary");
const subscriptionReferenceOutput =
  document.querySelector("#subscription-reference");
const paymentAmount = document.querySelector("#payment-amount");
const paymentState = document.querySelector("#payment-state");
const actionPanel = document.querySelector("#action-panel");
const actionIcon = document.querySelector("#action-icon");
const actionHeading = document.querySelector("#action-heading");
const actionDescription = document.querySelector("#action-description");
const paymentActions = document.querySelector("#payment-actions");
const refreshPaymentButton =
  document.querySelector("#refresh-payment-button");
const confirmPaymentButton =
  document.querySelector("#confirm-payment-button");

let subscriptionReference = null;
let currentPaymentAction = null;
let activeUserId = null;
let isBusy = false;
let authGeneration = 0;

function cleanStripeReturnParameters() {
  const url = new URL(window.location.href);
  let changed = false;

  STRIPE_RETURN_PARAMETERS.forEach((parameter) => {
    if (url.searchParams.has(parameter)) {
      url.searchParams.delete(parameter);
      changed = true;
    }
  });

  if (changed) {
    window.history.replaceState(
      null,
      "",
      url.pathname + url.search + url.hash
    );
  }
}

function readSubscriptionReference() {
  const reference = String(
    new URL(window.location.href).searchParams.get(
      SUBSCRIPTION_QUERY_PARAMETER
    ) ?? ""
  ).trim();

  if (
    !reference
    || !reference.startsWith("sub_")
    || reference.includes("/")
  ) {
    return null;
  }

  return reference;
}

function currentReturnUrl() {
  const returnUrl = new URL(window.location.pathname, window.location.origin);

  returnUrl.searchParams.set(
    SUBSCRIPTION_QUERY_PARAMETER,
    subscriptionReference
  );
  return returnUrl.href;
}

function normalizedErrorCode(error) {
  const code = String(error?.code ?? "").trim();
  const separatorIndex = code.lastIndexOf("/");

  return separatorIndex >= 0 ? code.slice(separatorIndex + 1) : code;
}

function setStatus(message, tone = "info") {
  paymentStatus.textContent = message;
  paymentStatus.classList.toggle("is-success", tone === "success");
  paymentStatus.classList.toggle("is-warning", tone === "warning");
  paymentStatus.classList.toggle("is-error", tone === "error");
  paymentStatus.hidden = !message;
}

function setBusy(busy) {
  isBusy = busy;
  paymentCard.setAttribute("aria-busy", String(busy));
  refreshPaymentButton.disabled = busy;
  confirmPaymentButton.disabled =
    busy || currentPaymentAction?.action !== "confirm_payment";
}

function showActions({confirm = false, refresh = false} = {}) {
  confirmPaymentButton.hidden = !confirm;
  refreshPaymentButton.hidden = !refresh;
  paymentActions.hidden = !confirm && !refresh;
  setBusy(isBusy);
}

function formatAmount(amountDue, currency) {
  try {
    const formatter = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency.toUpperCase()
    });
    const fractionDigits =
      formatter.resolvedOptions().maximumFractionDigits;

    return formatter.format(amountDue / (10 ** fractionDigits));
  } catch {
    return currency.toUpperCase() + " " + String(amountDue);
  }
}

function renderSummary(action) {
  subscriptionReferenceOutput.textContent = action.subscriptionReference;
  paymentAmount.textContent = formatAmount(
    action.amountDue,
    action.currency
  );
  paymentState.textContent = action.paymentStatus || "Pending";
  paymentSummary.hidden = false;
}

function renderAction(action) {
  currentPaymentAction = action;
  signInPanel.hidden = true;
  actionPanel.hidden = false;
  actionPanel.classList.remove("is-success", "is-error");
  renderSummary(action);

  switch (action.action) {
    case "confirm_payment": {
      const initialConfirmation = action.paymentStatus === "requires_confirmation";
      paymentHeading.textContent = initialConfirmation
        ? "Payment confirmation required" : "Authentication required";
      actionIcon.textContent = "!";
      actionHeading.textContent = "Confirm this payment";
      confirmPaymentButton.textContent = initialConfirmation
        ? "Pay " + formatAmount(action.amountDue, action.currency)
        : "Authenticate Payment";
      actionDescription.textContent = initialConfirmation
        ? "Select Pay to submit your first subscription payment using your saved card. " +
          "Your bank may ask you to authenticate the payment."
        : "Your bank requires an additional authentication step. " +
          "Select Authenticate Payment to continue securely with Stripe.";
      setStatus(
        initialConfirmation ? "Your first subscription payment has not been submitted yet."
          : "Your subscription payment is waiting for authentication.",
        "warning"
      );
      showActions({confirm: true, refresh: true});
      break;
    }

    case "complete":
      paymentHeading.textContent = "Payment complete";
      actionIcon.textContent = "✓";
      actionHeading.textContent = "Payment confirmed";
      actionDescription.textContent =
        "Stripe has confirmed this payment. ReadyHeroX will update " +
        "your subscription access automatically.";
      actionPanel.classList.add("is-success");
      setStatus("Your subscription payment is complete.", "success");
      showActions();
      break;

    case "wait":
      paymentHeading.textContent = "Payment processing";
      actionIcon.textContent = "…";
      actionHeading.textContent = "Stripe is processing your payment";
      actionDescription.textContent =
        "No further action is required right now. Check again shortly.";
      setStatus("Your payment is still processing.", "warning");
      showActions({refresh: true});
      break;

    case "replace_payment_method":
      paymentHeading.textContent = "Payment method required";
      actionIcon.textContent = "×";
      actionHeading.textContent = "This payment method cannot be used";
      actionDescription.textContent =
        "Return to ReadyHeroX and add or select another payment method, " +
        "then retry the subscription payment.";
      actionPanel.classList.add("is-error");
      setStatus("A different payment method is required.", "error");
      showActions({refresh: true});
      break;

    default:
      paymentHeading.textContent = "Payment unavailable";
      actionIcon.textContent = "?";
      actionHeading.textContent = "This payment cannot be completed here";
      actionDescription.textContent =
        "The invoice does not currently have a payment action available here. " +
        "Check again or return to ReadyHeroX.";
      actionPanel.classList.add("is-error");
      setStatus("No payment action is currently available.", "error");
      showActions({refresh: true});
  }
}

function renderSignInRequired() {
  authGeneration++;
  activeUserId = null;
  currentPaymentAction = null;
  paymentHeading.textContent = "Sign in to continue";
  signInPanel.hidden = false;
  paymentSummary.hidden = true;
  actionPanel.hidden = true;
  showActions();
  setBusy(false);
  setStatus(
    "This payment link must be opened by the subscription owner.",
    "warning"
  );
}

function renderLoadError(error) {
  const code = normalizedErrorCode(error);

  currentPaymentAction = null;
  actionPanel.hidden = false;
  actionPanel.classList.add("is-error");
  actionIcon.textContent = "×";
  showActions({
    refresh: code !== "not-found" && code !== "unauthenticated"
  });

  if (code === "unauthenticated") {
    renderSignInRequired();
    return;
  }

  if (code === "not-found") {
    paymentHeading.textContent = "Subscription unavailable";
    actionHeading.textContent = "Subscription not found";
    actionDescription.textContent =
      "This subscription does not belong to the signed-in account, " +
      "or it is no longer available.";
    setStatus("We could not open this subscription payment.", "error");
    return;
  }

  if (code === "failed-precondition") {
    paymentHeading.textContent = "Payment action not ready";
    actionHeading.textContent = "Waiting for payment details";
    actionDescription.textContent =
      "Stripe has not supplied a pending payment action yet. " +
      "Wait a moment, then check again.";
    setStatus("The payment action is not ready yet.", "warning");
    return;
  }

  paymentHeading.textContent = "Could not load payment";
  actionHeading.textContent = "Something went wrong";
  actionDescription.textContent =
    "Please check the link and try again. If the problem continues, " +
    "return to ReadyHeroX for assistance.";
  setStatus("Could not securely load this payment.", "error");
}

async function loadPaymentAction() {
  if (!subscriptionReference || !activeUserId || isBusy) {
    return null;
  }

  const generation = authGeneration;
  setBusy(true);
  setStatus("Checking your payment...");

  try {
    const action = await getStripeSubscriptionPaymentAction(
      subscriptionReference
    );

    if (generation !== authGeneration) return null;
    renderAction(action);
    return action;
  } catch (error) {
    if (generation !== authGeneration) return null;
    console.error(
      "Could not load Stripe subscription payment action.",
      normalizedErrorCode(error) || "unknown"
    );
    renderLoadError(error);
    return null;
  } finally {
    if (generation === authGeneration) setBusy(false);
  }
}

refreshPaymentButton.addEventListener("click", () => {
  loadPaymentAction();
});

confirmPaymentButton.addEventListener("click", async () => {
  if (
    isBusy
    || !activeUserId
    || currentPaymentAction?.action !== "confirm_payment"
    || !currentPaymentAction.paymentClientSecret
  ) {
    return;
  }

  const paymentClientSecret =
    currentPaymentAction.paymentClientSecret;
  const useSavedCard = currentPaymentAction.paymentStatus === "requires_confirmation";
  const generation = authGeneration;

  setBusy(true);
  setStatus(useSavedCard ? "Submitting your payment securely..."
    : "Opening secure payment authentication...", "warning");

  try {
    await confirmSubscriptionPayment({
      paymentClientSecret,
      returnUrl: currentReturnUrl(),
      ...(useSavedCard ? {useSavedCard: true} : {authenticationOnly: true})
    });
    if (generation !== authGeneration) return;
    setBusy(false);
    await loadPaymentAction();
  } catch (error) {
    if (generation !== authGeneration) return;
    console.error(
      "Stripe subscription payment confirmation failed.",
      normalizedErrorCode(error) || "stripe_error"
    );
    // A lost response can follow a successful charge. Recheck the invoice
    // before offering another action, and trust paid/processing over the error.
    currentPaymentAction = null;
    showActions({refresh: true});
    setBusy(false);
    const action = await loadPaymentAction();
    if (generation !== authGeneration) return;
    if (action && !["complete", "wait"].includes(action.action)) {
      setStatus(error?.message || "Stripe could not confirm this payment.", "error");
    }
  }
});

cleanStripeReturnParameters();
subscriptionReference = readSubscriptionReference();

if (!subscriptionReference) {
  paymentCard.setAttribute("aria-busy", "false");
  paymentHeading.textContent = "Invalid payment link";
  actionPanel.hidden = false;
  actionPanel.classList.add("is-error");
  actionIcon.textContent = "×";
  actionHeading.textContent = "Subscription reference missing";
  actionDescription.textContent =
    "Use the complete-payment link supplied by ReadyHeroX.";
  setStatus("This payment link is invalid or incomplete.", "error");
  showActions();
} else {
  subscriptionReferenceOutput.textContent = subscriptionReference;

  onFirebaseAuthStateChanged((authUser) => {
    if (!authUser) {
      renderSignInRequired();
      return;
    }

    if (activeUserId === authUser.uid) {
      return;
    }

    authGeneration++;
    currentPaymentAction = null;
    paymentSummary.hidden = true;
    actionPanel.hidden = true;
    showActions();
    setBusy(false);
    activeUserId = authUser.uid;
    signInPanel.hidden = true;
    loadPaymentAction();
  });
}

document.querySelector(".back-link").href = HOME_URL;
