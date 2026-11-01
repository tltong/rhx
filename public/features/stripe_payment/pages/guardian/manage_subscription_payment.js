import {getStripeSubscriptionPaymentDetails, getStripeSubscriptionPaymentAction,
  retryStripeSubscriptionPayment, createStripeSubscriptionCardSetup,
  updateStripeSubscriptionPaymentMethod, getStripeGuardianSubscriptionOptions,
  prepareStripeStudentSubscription, createStripeStudentSubscription, changeStripeStudentSubscriptionPlan,
  prepareStripeRenewalPayment, cancelStripeRenewalPayment, cancelStripeRenewalRecovery, cancelStripeStudentSubscription}
  from "../../../stripe_payment_subscription/stripe_payment_subscription_module.js?v=20261101-stored-status-v1";
import {mountSetupPaymentElement, confirmSetup, confirmSubscriptionPayment,
  disposePaymentElement} from "../../stripe_payment_module.js?v=20261101-stored-status-v1";
import {onFirebaseAuthStateChanged} from "../../../../utils/firebase/firebase_auth.js";

const $ = selector => document.querySelector(selector);
const pageUrl = new URL(window.location.href);
const originalSubscriptionReference = pageUrl.searchParams.get("subscriptionReference");
const requestedStudentId = pageUrl.searchParams.get("studentId");
let subscriptionReference = originalSubscriptionReference;
const originalInvoiceReference = pageUrl.searchParams.get("invoiceReference");
let linkedInvoiceReference = originalInvoiceReference;
const returnedSetupIntent = pageUrl.searchParams.get("setup_intent");
const returnedPayment = pageUrl.searchParams.has("payment_intent");
const RETURN_PARAMETERS = ["setup_intent", "setup_intent_client_secret", "payment_intent",
  "payment_intent_client_secret", "redirect_status"];
RETURN_PARAMETERS.forEach(name => pageUrl.searchParams.delete(name));
window.history.replaceState(null, "", pageUrl.pathname + pageUrl.search);
let userId = null, generation = 0, busy = false, details = null, form = null;
let memoryAttempt = null, paymentUncertain = false;
let selection = null, selectedStudentId = requestedStudentId, checkoutUncertain = false;
let updateTimer = null, updateChecks = 0;
function renderSync(value) {
  clearTimeout(updateTimer);
  const sync = value?.syncState, notice = $("#payment-sync-notice");
  notice.hidden = sync?.state !== "pending";
  notice.textContent = sync?.state === "pending" ? "Updating payment status. "
    + (sync.lastConfirmedAt ? "The last confirmed details remain visible. " : "Subscription details are being prepared. ")
    + (sync.unavailable ? "The payment service is temporarily unavailable. Check again shortly." : "Please wait before making another payment.") : "";
  $("#checked-at").textContent = sync ? sync.lastConfirmedAt ? "Last confirmed: " + date(sync.lastConfirmedAt) : "Awaiting confirmation"
    : "Last checked: " + new Date().toLocaleTimeString();
  if (sync?.state === "pending" && updateChecks < 12) {
    const requestGeneration = generation;
    updateTimer = setTimeout(async () => {
      if (requestGeneration !== generation || !userId || busy || form) return;
      updateChecks++;
      // These reads consult the schema only. Polling never calls Stripe.
      if (await loadSelection()) await loadDetails();
    }, 5000);
  }
}

function storageKey(kind) { return `rhx.stripe.${kind}.v1:${userId}:${kind === "studentCheckout" ? (selection?.paymentMode || "unknown") + ":student:" + selectedStudentId : subscriptionReference}`; }
function readStorage(kind) { try {return JSON.parse(sessionStorage.getItem(storageKey(kind)) || "null");} catch {return null;} }
function writeStorage(kind, value) { try {
  if (value === null) sessionStorage.removeItem(storageKey(kind));
  else sessionStorage.setItem(storageKey(kind), JSON.stringify(value));
} catch { /* Stripe idempotency and invoice settlement remain authoritative. */ } }
function references() {return {subscriptionReference,
  ...(linkedInvoiceReference ? {invoiceReference: linkedInvoiceReference} : {})};}
function returnUrl(invoiceReference = linkedInvoiceReference) {
  const url = new URL("./manage_subscription_payment.html", window.location.href);
  if (subscriptionReference) url.searchParams.set("subscriptionReference", subscriptionReference);
  if (selectedStudentId) url.searchParams.set("studentId", selectedStudentId);
  if (invoiceReference) url.searchParams.set("invoiceReference", invoiceReference);
  return url.href;
}
function code(error) {return String(error?.code || "").split("/").pop();}
function friendlyError(error) {
  const messages = {
    unauthenticated: "Sign in with the guardian account that owns this subscription.",
    "not-found": "This subscription or invoice is unavailable for the signed-in account.",
    "failed-precondition": "This action is no longer available. Check the latest status or start card setup again.",
    "invalid-argument": "The payment link or request is invalid. Request a new link.",
    canceled: "Bank authentication was cancelled. Check payment status before trying again.",
    card_declined: "Your bank declined this card. Check with your bank or use another card.",
    insufficient_funds: "Your bank reported insufficient funds. Add funds or use another card.",
    expired_card: "This card has expired. Enter another card.",
    incomplete_number: "Complete the card number.", incomplete_cvc: "Complete the card security code.",
    incomplete_expiry: "Complete the card expiry date."
  };
  return messages[code(error)] || "The result could not be confirmed. Check the latest status before trying again.";
}
function showLookupError(error) {
  const errorCode = code(error) || "client-error";
  const unavailable = {
    heading: "Subscription unavailable",
    description: "This subscription or invoice is unavailable for the signed-in guardian. The link may refer to an old or deleted subscription.",
    recovery: "Open the Guardian Dashboard to select a current subscription. A canceled subscription requires a new checkout."
  };
  const connection = {
    heading: "Payment service unavailable",
    description: "The subscription service could not be reached. Check your connection and try again.",
    recovery: "Try Check payment status again before attempting another payment."
  };
  const failures = {
    "not-found": unavailable,
    "permission-denied": unavailable,
    unauthenticated: {
      heading: "Sign in to continue",
      description: "Your sign-in could not be verified. Use the guardian account that owns this subscription.",
      recovery: "Sign in using the link below, then check the payment status again."
    },
    "invalid-argument": {
      heading: "Invalid payment link",
      description: "The subscription or invoice reference in this link is invalid.",
      recovery: "Open the subscription payment link from the Guardian Dashboard."
    },
    "failed-precondition": {
      heading: "Subscription unavailable",
      description: "Payment management is currently unavailable for this subscription.",
      recovery: "Open the Guardian Dashboard to check the subscription, or contact support."
    },
    unavailable: connection,
    "deadline-exceeded": connection,
  };
  const failure = failures[errorCode] || {
    heading: "Could not check payment status",
    description: "The subscription details could not be loaded. Refresh to check again.",
    recovery: "Check payment status again before attempting another payment, or contact support."
  };
  banner(failure.heading, failure.description, "warning");
  $("#sign-in-panel").hidden = errorCode !== "unauthenticated";
  const supportCode = /^[a-z][a-z-]{0,39}$/.test(errorCode) ? ` Support code: ${errorCode}.` : "";
  setError(failure.recovery + supportCode);
}
function failureReason(value) {
  return ({insufficient_funds: "Your bank reported insufficient funds.",
    expired_card: "The card has expired.", lost_card: "The bank reported this card as lost.",
    stolen_card: "The bank blocked this card.", processing_error: "The bank could not process this payment.",
    authentication_required: "Your bank requires authentication."})[value]
    || "The bank could not complete the renewal payment.";
}
function amount(value, currency) {
  const formatter = new Intl.NumberFormat(undefined, {style: "currency", currency: currency.toUpperCase()});
  const exponent = ["ISK", "UGX"].includes(currency.toUpperCase()) ? 2 : formatter.resolvedOptions().maximumFractionDigits;
  return formatter.format(value / (10 ** exponent));
}
function date(value) {return new Date(value).toLocaleString(undefined, {dateStyle: "medium", timeStyle: "short"});}
function cardLabel(card) {return card ? `${card.brand.toUpperCase()} •••• ${card.last4} · ${String(card.expiryMonth).padStart(2, "0")}/${card.expiryYear}` : "No saved card";}
function setError(message = "") {$("#payment-error").textContent = message; $("#payment-error").hidden = !message;}
function status(message = "") {$("#payment-status").textContent = message; $("#payment-status").hidden = !message;}
function selectedCardScope() {return $("#card-scope-all").checked ? "all_students" : "subscription";}
function renderCardScope() {
  const all = selectedCardScope() === "all_students";
  $("#this-student-label").textContent = `${details?.studentName || details?.studentId || "This student"}'s subscription`;
  $("#card-scope-description").textContent = all
    ? "The new card will be applied to every eligible subscription listed below."
    : "Only this student's subscription will use the new card. Other students keep their existing cards.";
  const targets = all ? details?.cardChangeTargets || [] : [{studentName: details?.studentName || details?.studentId || "This student", planId: details?.planId}];
  $("#card-scope-targets").replaceChildren(...targets.map(target => {
    const item = document.createElement("li");item.textContent = target.studentName + (target.planId ? ` · ${target.planId}` : ""); return item;
  }));
}
function renderCardUpdate(result) {
  $("#card-update-summary").hidden = !result;
  $("#card-update-results").replaceChildren();
  if (!result) return;
  for (const [state, message] of [["updated", "Card updated"], ["failed", "Update not confirmed; finish saving to try again"],
    ["skipped", "No longer eligible; card not updated"]]) {
    for (const ref of result[state]) {
      const target = details?.cardChangeTargets?.find(t => t.subscriptionReference === ref);
      const item = document.createElement("li");
      item.textContent = `${target?.studentName || ref}: ${message}`;$("#card-update-results").append(item);
    }
  }
}
function setBusy(value) {
  busy = value;
  $("#cancel-subscription-button").disabled = busy || !!form || !userId || !details?.canCancelSubscription;
  $("#confirm-subscription-cancellation").disabled = busy || !!form || !userId || !details?.canCancelSubscription;
  $("#keep-subscription-button").disabled = busy;
  $("#payment-card").setAttribute("aria-busy", String(value));
  const renewal = details?.renewal;
  $("#renewal-plan-select").disabled = busy || !!form || !!details?.recoveryPending;
  $("#cancel-pending-renewal-button").disabled = busy || !!form || !details?.canCancelPendingPayment;
  $("#cancel-renewal-button").disabled = busy || !!form || !details?.canCancelRenewal;
  const locked = busy || !userId || !!form || paymentUncertain || !details?.linkedInvoiceIsCurrent;
  const updating = details?.syncState?.state === "pending";
  $("#retry-payment-button").disabled = locked || updating || !renewal?.canRetry;
  $("#confirm-payment-button").disabled = locked || renewal?.action !== "confirm_payment";
  $("#use-new-card-button").disabled = locked || updating || !renewal?.canPayWithNewCard;
  $("#change-card-button").disabled = busy || !userId || !!form || !details?.canChangeCard;
  $("#refresh-payment-button").disabled = busy || !userId || !!form;
  $("#card-submit-button").disabled = busy || !form?.contextReference;
  $("#card-cancel-button").disabled = busy;
  $("#card-scope-subscription").disabled = busy || !!form || !details?.canChangeCard;
  $("#card-scope-all").disabled = busy || !!form || !details?.canChangeAllStudents;
  $("#finish-save-button").disabled = busy || !userId || !!form;
  $("#linked-student-select").disabled = busy || !!form || !selection?.students.length;
  $("#subscription-plan-select").disabled = busy || !!form || checkoutUncertain;
  $("#checkout-saved-card").disabled = busy || !!form || checkoutUncertain || !selection?.savedCard;
  $("#checkout-new-card").disabled = busy || !!form || checkoutUncertain;
  $("#create-student-subscription").disabled = busy || !!form || !userId || !selection?.canCreate || checkoutUncertain || !checkoutPlan();
  $("#finish-student-subscription").disabled = busy || !!form || !userId;
  $("#change-subscription-plan-select").disabled = busy || !!form || selection?.nextPlan?.state === "updating";
  const target = changePlanChoice();
  $("#change-student-subscription-plan").disabled = busy || !!form || !userId || !selection?.canChangePlan || !target
    || (target.planId === selection.currentPlanId && !selection.nextPlan)
    || (target.planId === selection.nextPlan?.planId && selection.nextPlan.state === "scheduled");
}
function closeForm(clearSetup = false) {
  const creatingStudent = form?.purpose === "create";
  if (form?.contextReference) disposePaymentElement({contextReference: form.contextReference});
  form = null;
  $("#card-form-section").hidden = true;
  $("#card-entry-container").replaceChildren();
  $("#card-form-error").hidden = true;
  if (clearSetup) writeStorage("cardSetup", null);
  if (clearSetup && creatingStudent) writeStorage("studentCheckout", null);
}
function hidePrivateDetails() {
  clearTimeout(updateTimer); $("#payment-sync-notice").hidden = true;
  closeForm(); details = null; memoryAttempt = null;
  $("#subscription-cancellation-section").hidden = true;
  $("#subscription-cancellation-confirmation").hidden = true;
  $("#subscription-cancellation-confirmation-text").textContent = "";
  for (const id of ["payment-summary", "renewal-recovery-summary", "saved-card-section", "renewal-section", "renewal-retry-summary", "payment-actions", "finish-save-button", "initial-payment-notice"]) $("#" + id).hidden = true;
  $("#default-card").textContent = ""; $("#saved-card").textContent = "";
  $("#invoice-reference").textContent = ""; $("#payment-amount").textContent = "";
  $("#checked-at").textContent = ""; $("#student-name").textContent = "";
  $("#card-scope-targets").replaceChildren(); $("#card-scope-subscription").checked = true;
  $("#this-student-label").textContent = "This student's subscription"; $("#card-scope-description").textContent = ""; renderCardUpdate(null);
  for (const id of ["renewal-plan-section", "cancel-pending-renewal-button", "cancel-renewal-button", "cancel-renewal-explanation"]) $("#" + id).hidden = true;
}
function recoveryV2() {return details?.renewalRecovery?.version === 2;}
function recoveryPlanInput() {
  const plan = selection?.plans.find(p => p.planId === $("#renewal-plan-select").value);
  return plan ? {planId: plan.planId, quoteReference: plan.quoteReference} : {};
}
function renderRecoveryPlans() {
  const available = recoveryV2() && details.paymentState !== "paid";
  $("#renewal-plan-section").hidden = !available;
  $("#cancel-pending-renewal-button").hidden = !details?.canCancelPendingPayment;
  $("#cancel-renewal-button").hidden = !details?.canCancelRenewal;
  $("#cancel-renewal-explanation").hidden = !details?.canCancelRenewal;
  if (!available) return;
  const selected = details.recoveryPending ? details.renewal?.planId : $("#renewal-plan-select").value || details.planId;
  const plans = (selection?.plans || []).filter(p => p.amount > 0 && p.months >= 1 && p.months <= 24 && p.currency.toLowerCase() === details.renewal.currency.toLowerCase());
  if (!plans.some(p => p.planId === details.planId)) plans.unshift({planId: details.planId,
    name: details.planId + " (current plan)", amount: details.renewal.amountDue, currency: details.renewal.currency});
  $("#renewal-plan-select").replaceChildren(...plans.map(plan => {
    const option = document.createElement("option"); option.value = plan.planId;
    option.textContent = `${plan.name} · ${amount(plan.amount, plan.currency)}${plan.months ? ` / ${plan.months} month${plan.months === 1 ? "" : "s"}` : ""}`;
    return option;
  }));
  if (plans.some(p => p.planId === selected)) $("#renewal-plan-select").value = selected;
  renderRecoveryPrice();
}
function renderRecoveryPrice() {
  const plan = selection?.plans.find(p => p.planId === $("#renewal-plan-select").value);
  $("#renewal-plan-price").textContent = plan ? `${amount(plan.amount, plan.currency)} for ${plan.months} month${plan.months === 1 ? "" : "s"}. Payment starts the new period.` : "Retry the current subscription plan.";
  if (recoveryV2() && !details.recoveryPending && plan) $("#payment-amount").textContent = amount(plan.amount, plan.currency);
}
function banner(heading, description, tone = "") {
  $("#payment-heading").textContent = heading;
  $("#billing-description").textContent = description;
  for (const name of ["error", "warning", "success"]) $("#billing-banner").classList.toggle("is-" + name, name === tone);
}
function render(value) {
  details = value;
  $("#subscription-cancellation-section").hidden = !value.canCancelSubscription && !value.cancellation;
  $("#cancel-subscription-button").hidden = !value.canCancelSubscription;
  $("#subscription-cancellation-confirmation").hidden = true;
  $("#subscription-cancellation-description").textContent = value.cancellation?.state === "pending"
    ? "Cancellation is being confirmed. A payment already in progress must be checked before cancellation can finish. Do not start another payment."
    : value.cancellation?.state === "cancelled"
      ? `The subscription has been cancelled in Stripe.${value.cancellation.accessUntil ? " Access ends " + date(value.cancellation.accessUntil) + "." : ""}`
      : `Cancellation stops this student's subscription in Stripe immediately. ${value.accessUntil ? "Existing access continues until " + date(value.accessUntil) + "." : "No new access period is granted."} Other students' subscriptions and the saved card are kept.`;
  $("#payment-amount-label").textContent = value.renewalRecovery?.version === 2 ? value.paymentState === "paid" ? "Amount paid" : "New payment amount" : "Amount due";
  const renewal = value.renewal;
  $("#sign-in-panel").hidden = true;
  $("#payment-summary").hidden = false;
  $("#saved-card-section").hidden = false;
  $("#subscription-reference").textContent = value.subscriptionReference;
  $("#student-name").textContent = value.studentName || value.studentId || "Student unavailable";
  if (!value.canChangeAllStudents) $("#card-scope-subscription").checked = true;
  renderCardScope(); renderCardUpdate(value.cardUpdateResult);
  const inactive = ["canceled", "incomplete_expired"].includes(value.subscriptionStatus);
  const suspended = value.applicationStatus === "suspended";
  const initialIncomplete = value.subscriptionStatus === "incomplete"
    || (!value.renewal && ["failed", "unpaid", "authentication_required"].includes(value.paymentState));
  $("#subscription-state").textContent = inactive ? "Inactive" : suspended ? "Suspended"
    : initialIncomplete ? "Initial payment incomplete" : "Active";
  const recovery = value.renewalRecovery;
  $("#renewal-recovery-summary").hidden = !recovery;
  if (recovery) {
    $("#access-grace-until").textContent = recovery.graceUntil ? date(recovery.graceUntil) : "Unavailable";
    $("#recovered-period-row").hidden = !recovery.paidAt || !recovery.paidThrough;
    $("#recovered-period").textContent = recovery.paidAt && recovery.paidThrough
      ? `${date(recovery.paidAt)} – ${date(recovery.paidThrough)}` : "";
    $("#renewal-recovery-description").textContent = recovery.state === "completed"
      ? "The recovery payment started a full new subscription period. Your next renewal is due at the end of this paid period."
      : recovery.state === "pending_reset" ? "Payment is confirmed. The new billing cycle and subscription access are being updated. Do not pay again."
        : recovery.state === "manual_review" ? "Billing needs review. Contact support before attempting another payment."
          : suspended ? "Student access is suspended. Complete the outstanding renewal to start a full new paid period and restore access."
            : "Access remains active until the grace period ends. A successful recovery payment starts a full new paid period from its payment date.";
  }
  const retry = value.renewalRetry;
  $("#renewal-retry-summary").hidden = !retry;
  if (retry) {
    $("#automatic-retry-count").textContent = `${retry.attemptsMade} of ${retry.maxRetries}`;
    $("#automatic-retry-interval").textContent = `${retry.intervalHours} hours`;
    $("#retry-window-end").textContent = retry.graceUntil ? date(retry.graceUntil) : "Unavailable";
    $("#retry-state-description").textContent = value.paymentState === "paid"
      ? retry.state === "completed" ? "This renewal is paid. No automatic retries remain."
        : "The payment is confirmed. The retry sequence and subscription status are updating."
      : retry.state === "exhausted"
      ? "The retry limit or retry period has ended. Complete the outstanding renewal payment to restore the subscription status. Student access is suspended after the grace period ends."
      : retry.state === "completed" ? "This renewal is paid. No automatic retries remain."
        : retry.state === "awaiting_action" ? retry.maxRetries === 0
          ? "Automatic retries are disabled. Retry manually before the grace period ends."
          : retry.attemptsMade >= retry.maxRetries ? "Automatic retries are exhausted. Retry manually or update the card before the grace period ends."
            : "Retry the payment, update the card or complete bank authentication before the grace period ends."
          : retry.state === "stopped" ? "Automatic retries stopped because this invoice is no longer eligible."
            : retry.state === "processing" || retry.state === "leased" ? "The payment result is being checked."
              : suspended ? "Automatic retries are scheduled. The subscription status remains Suspended until payment is confirmed."
                : "The subscription remains active during the retry period.";
  }
  $("#plan-row").hidden = !value.planId;
  $("#plan-reference").textContent = value.planId || "";
  $("#next-charge-row").hidden = !value.nextChargeAt;
  $("#next-charge").textContent = value.nextChargeAt ? date(value.nextChargeAt) : "";
  $("#default-card").textContent = cardLabel(value.currentCard);
  $("#card-change-unavailable").hidden = value.canChangeCard;
  $("#renewal-section").hidden = !renewal;
  $("#action-panel").hidden = !renewal;
  $("#refresh-payment-button").hidden = false;
  const state = value.paymentState;
  const initialPending = !renewal && ["failed", "unpaid", "authentication_required"].includes(state);
  $("#initial-payment-notice").hidden = !initialPending;
  $("#complete-initial-payment").href = "/features/stripe_payment/pages/complete_subscription_payment/complete_subscription_payment.html?subscriptionReference="
    + encodeURIComponent(subscriptionReference);
  if (inactive) {
    banner("Subscription inactive", "This subscription has no future automatic renewal. Contact support for help.", "warning");
  } else if (suspended && state !== "paid") {
    banner("Subscription suspended", "The renewal remains unpaid and the automatic retry limit or retry period has ended. Use a payment option below to restore the subscription status. Student access is suspended after the grace period ends.", "error");
  } else if (initialPending) {
    banner("Initial payment incomplete", "Complete your initial subscription payment before managing future charges.", "warning");
  } else if (state === "failed") {
    banner("Renewal payment failed", `${renewal ? amount(renewal.amountDue, renewal.currency) + " remains unpaid. " : ""}${failureReason(renewal?.failureCode)} ${retry && !["stopped", "completed"].includes(retry.state) ? "Your subscription remains active during the retry period. " : ""}Choose a retry option below.`, "error");
  } else if (state === "authentication_required") {
    banner("Bank authentication required", "Your bank needs you to authenticate this payment. Complete the secure bank prompt below.", "warning");
  } else if (state === "processing") {
    banner("Payment processing", "Stripe is processing this payment. Check again shortly to confirm the result.");
  } else if (state === "paid") {
    banner(renewal ? "Payment complete" : "Payments up to date", suspended
      ? "The payment is confirmed. The subscription status is updating; check again shortly."
      : "Stripe has confirmed the latest invoice is paid.", "success");
    writeStorage("invoiceRetry", null); memoryAttempt = null;
  } else if (state === "unpaid") {
    banner(renewal ? "Renewal invoice unpaid" : "Initial payment incomplete", renewal
      ? "This renewal invoice remains unpaid. Review the payment options below."
      : "Complete your initial subscription payment before managing future charges.", "warning");
  } else if (state === "no_invoice") {
    banner("No renewal invoice", "You can manage your saved card for future subscription payments.");
  } else {
    banner("Payment status unavailable", "No payable renewal invoice is currently available. You can manage the saved card when card changes are available.");
  }
  if (recovery?.state === "pending_reset") {
    banner("Payment received", "Your payment is confirmed. The subscription status and next billing date are updating. Do not pay again.", "warning");
  } else if (recovery?.state === "manual_review") {
    banner("Billing review required", "Contact support to review this subscription. Payment actions are unavailable until the billing issue is resolved.", "warning");
  } else if (recovery?.state === "completed" && state === "paid") {
    banner("Payment complete", `Your new paid period runs from ${date(recovery.paidAt)} to ${date(recovery.paidThrough)}.`, "success");
  }
  if (renewal) {
    $("#invoice-reference").textContent = renewal.attemptInvoiceReference || renewal.invoiceReference;
    $("#payment-amount").textContent = amount(renewal.amountDue, renewal.currency);
    $("#payment-state").textContent = renewal.invoiceStatus || renewal.paymentStatus || "Pending";
    $("#saved-card-row").hidden = !renewal.savedCard;
    $("#saved-card").textContent = cardLabel(renewal.savedCard);
    $("#retry-payment-button").textContent = renewal.savedCard
      ? "Retry with card ending " + renewal.savedCard.last4 : "Retry with current card";
    $("#next-retry-row").hidden = !renewal.nextPaymentAttemptAt;
    $("#next-retry").textContent = renewal.nextPaymentAttemptAt ? date(renewal.nextPaymentAttemptAt) : "";
    $("#old-invoice-notice").hidden = value.linkedInvoiceIsCurrent;
    $("#view-current-invoice").href = returnUrl(null);
    const payable = ["failed", "unpaid", "authentication_required"].includes(state);
    $("#payment-actions").hidden = !payable;
    $("#confirm-payment-button").hidden = renewal.action !== "confirm_payment";
    $("#retry-payment-button").hidden = renewal.action === "confirm_payment";
    $("#use-new-card-button").hidden = !payable;
    $("#action-heading").textContent = state === "paid" ? "Invoice paid" : "Resolve this renewal";
    $("#action-description").textContent = state === "paid"
      ? recovery?.state === "completed" ? "Your new paid period starts on the successful payment date. Access has been restored."
        : "Your existing billing schedule is retained. Subscription access updates automatically."
      : "Retry with the card shown for this invoice, or pay with a new card and save it for future renewals. Saving a card in the section above is a separate action.";
  }
  if (recoveryV2()) {
    renderRecoveryPlans();
    if (state === "failed" && !suspended && !value.renewalCancelled && recovery?.state !== "manual_review") {
      banner("Renewal payment failed", `${failureReason(renewal?.failureCode)} Access remains active until ${date(recovery.graceUntil)}. Choose a plan and pay to start a new period.`, "error");
    }
    if (state !== "paid") $("#plan-change-unavailable").textContent = "For this failed renewal, choose the current plan or a different plan in the payment section below.";
    if (suspended && state !== "paid") $("#retry-state-description").textContent = "Automatic retries have stopped. A successful manual payment starts a new paid period.";
    if (state === "paid" && Number.isSafeInteger(renewal?.amountPaid)) $("#payment-amount").textContent = amount(renewal.amountPaid, renewal.currency);
    if (!value.recoveryPending && state === "failed") {writeStorage("invoiceRetry", null); memoryAttempt = null;}
    if (value.renewalCancelled && state !== "paid") {
      banner("Automatic retries stopped", suspended ? "Access is suspended. Choose a plan and make a new payment to restart."
        : "Further automatic attempts have stopped. Access continues until the original grace deadline.", "warning");
    } else if (suspended && state !== "paid" && !value.recoveryPending) {
      banner("Subscription suspended", "The grace period ended. The unpaid expired period has been dropped. Choose a plan and pay to start a new period.", "error");
    } else if (state === "failed" && renewal?.failureCode === "authentication_required") {
      banner("Renewal failed: bank authentication required", "The automatic payment stopped. Pay manually below to open a new secure bank approval session.", "warning");
    } else if (renewal?.action === "enter_new_card") {
      banner("Card details required", "Enter your card to complete the payment already started, or cancel the pending payment before choosing another plan.", "warning");
    }
    if (!value.recoveryPending && state !== "paid") $("#action-description").textContent = "Choose the current plan or a different plan, then pay with the saved card or a new card. A fresh invoice covers the new paid period.";
    if (suspended && recovery?.state !== "completed") $("#renewal-recovery-description").textContent = "Access is suspended. A successful new payment starts a full paid period and restores access.";
    if ((renewal?.requiresNewCard || ["expired_card", "lost_card", "stolen_card", "pickup_card"].includes(renewal?.failureCode)) && !renewal.canRetry) banner("New card required", "Automatic retries have stopped. Pay with a new card. The original grace deadline still applies.", "error");
  }
  if (value.firstChargeAt && !value.cancellation) banner("Subscription ready", "Existing paid access continues. The first charge for this subscription is scheduled for " + date(value.firstChargeAt) + ".", "success");
  if (value.cancellation) {
    $("#subscription-state").textContent = value.cancellation.state === "pending" ? "Cancellation pending" : "Cancelled";
    banner(value.cancellation.state === "pending" ? "Cancellation pending" : "Subscription cancelled", $("#subscription-cancellation-description").textContent, "warning");
    $("#payment-actions").hidden = true;
    $("#initial-payment-notice").hidden = true;
  }
  renderSync(value);
  setBusy(busy);
}
async function loadDetails(refreshFromStripe = false) {
  if (!userId || busy || form || !subscriptionReference) return;
  const requestGeneration = generation;
  let refreshOptions = false;
  setBusy(true); setError(); status("Checking subscription payment status...");
  try {
    const result = await getStripeSubscriptionPaymentDetails({...references(), ...(refreshFromStripe ? {refreshFromStripe: true} : {})});
    if (requestGeneration !== generation) return;
    refreshOptions = result.renewalRecovery?.version === 2 && result.paymentState === "paid"
      && (selection?.currentPlanId !== result.planId || !selection?.canChangePlan);
    refreshOptions ||= result.cancellation?.state === "cancelled";
    paymentUncertain = false; render(result); status();
  } catch (error) {
    if (requestGeneration !== generation) return;
    if (!details || ["not-found", "permission-denied", "unauthenticated"].includes(code(error))) hidePrivateDetails();
    else paymentUncertain = true;
    status();
    showLookupError(error);
    $("#refresh-payment-button").hidden = false;
  } finally {if (requestGeneration === generation) setBusy(false);}
  if (refreshOptions && requestGeneration === generation) await loadSelection();
}
function checkoutPlan() {return selection?.plans.find(plan => plan.planId === $("#subscription-plan-select").value);}
function planLabel(plan) {return `${plan.name} · ${amount(plan.amount, plan.currency)} every ${plan.months} month${plan.months === 1 ? "" : "s"}`;}
function changePlanChoice() {return selection?.plans.find(plan => plan.planId === $("#change-subscription-plan-select").value);}
function renderChangePlanPrice() {
  const plan = changePlanChoice();
  $("#change-plan-price").textContent = plan ? `${planLabel(plan)}${selection.nextRenewalAt ? ", starting " + date(selection.nextRenewalAt) : " at the next renewal"}.` : "";
  setBusy(busy);
}
function renderPlanChoices() {
  $("#change-subscription-plan-section").hidden = !selection?.canChangePlan;
  $("#plan-change-unavailable").hidden = !selection?.subscriptionReference || selection.canChangePlan;
  $("#change-subscription-plan-select").replaceChildren(...(selection?.plans || []).map(plan => {
    const option = document.createElement("option"); option.value = plan.planId; option.textContent = planLabel(plan); return option;
  }));
  $("#change-subscription-plan-select").value = selection?.nextPlan?.planId || selection?.currentPlanId || selection?.plans[0]?.planId || "";
  $("#scheduled-plan-description").hidden = !selection?.nextPlan;
  if (selection?.nextPlan) {
    const plan = selection.plans.find(plan => plan.planId === selection.nextPlan.planId);
    $("#scheduled-plan-description").textContent = selection.nextPlan.state === "scheduled"
      ? `${plan?.name || selection.nextPlan.planId} is scheduled to start ${date(selection.nextPlan.effectiveAt)}.`
      : "A plan update is being confirmed. Refresh to check its status before making another change.";
  }
  renderChangePlanPrice();
}
function renderCheckoutPrice() {
  const plan = checkoutPlan();
  $("#selected-plan-price").textContent = plan ? `${planLabel(plan)}. ${selection?.firstChargeAt
    ? "No payment is taken now. First charge: " + date(selection.firstChargeAt) + ". Existing paid access continues until then."
    : "The first payment starts when you create the subscription."}` : "";
  $("#create-student-subscription").textContent = $("#checkout-saved-card").checked ? "Create subscription with saved card" : "Continue with new card";
  $("#checkout-payment-note").textContent = selection?.firstChargeAt
    ? "Creating this subscription schedules future payments. No subscription payment is taken now. A new card may require bank verification. Other students keep their existing subscriptions."
    : "Creating a subscription starts payment for the selected plan. Bank authentication may be required. Other students keep their existing subscriptions.";
  setBusy(busy);
}
async function loadSelection(refreshFromStripe = false) {
  if (!userId || busy || form) return false;
  const requestGeneration = generation;
  setBusy(true); setError(); status("Loading your linked students and subscription plans...");
  try {
    const value = await getStripeGuardianSubscriptionOptions({
      ...(refreshFromStripe ? {refreshFromStripe: true} : {}),
      ...(selectedStudentId ? {studentId: selectedStudentId} : {}),
      ...(!selectedStudentId && originalSubscriptionReference ? {subscriptionReference: originalSubscriptionReference} : {})});
    if (requestGeneration !== generation) return false;
    selection = value; selectedStudentId = value.selectedStudentId;
    if (!value.subscriptionReference) hidePrivateDetails();
    subscriptionReference = value.subscriptionReference;
    if (originalSubscriptionReference && originalSubscriptionReference !== subscriptionReference) linkedInvoiceReference = null;
    $("#student-selector-panel").hidden = false;
    $("#linked-student-select").replaceChildren(...value.students.map(student => {
      const option = document.createElement("option"); option.value = student.studentId; option.textContent = student.studentName; return option;
    }));
    $("#linked-student-select").value = selectedStudentId || "";
    $("#subscription-plan-section").hidden = !selectedStudentId;
    $("#create-subscription-section").hidden = !value.canCreate;
    const current = value.plans.find(plan => plan.planId === value.currentPlanId);
    $("#current-plan-description").textContent = subscriptionReference
      ? `Current plan: ${current?.name || value.currentPlanId || "Registered subscription"}. Manage payments and the saved card below.`
      : ({no_plans: "No subscription plans are available for this student's country. Contact support.",
        plans_unavailable: "Subscription plans could not be loaded. Check again shortly or contact support.",
        managed_by_another_guardian: "This student's subscription is managed by another guardian. Contact that guardian or support.",
        checkout_needs_review: "An earlier checkout could not be confirmed. Contact support before creating another subscription.",
        different_payment_environment: "This student has a production subscription. Payment configuration must use the matching environment."})[value.blockedReason]
        || "This student has no subscription set up for automatic payments. Choose a plan to start one.";
    $("#subscription-plan-select").replaceChildren(...value.plans.map(plan => {
      const option = document.createElement("option"); option.value = plan.planId; option.textContent = planLabel(plan); return option;
    }));
    let pending = readStorage("studentCheckout");
    if (subscriptionReference && pending?.stage === "creating") {writeStorage("studentCheckout", null); pending = null;}
    if (pending?.planId && value.plans.some(plan => plan.planId === pending.planId)) $("#subscription-plan-select").value = pending.planId;
    checkoutUncertain = !subscriptionReference && pending?.stage === "creating";
    $("#finish-student-subscription").hidden = !value.canCreate || !["confirming", "creating"].includes(pending?.stage);
    $("#checkout-saved-card-option").hidden = !value.savedCard;
    $("#checkout-saved-card-label").textContent = value.savedCard ? "Use saved " + cardLabel(value.savedCard) : "";
    $("#checkout-saved-card").checked = !!value.savedCard;
    $("#checkout-new-card").checked = !value.savedCard;
    renderCheckoutPrice();
    renderPlanChoices();
    renderSync(value);
    if (!subscriptionReference) {
      banner(!selectedStudentId ? "Link a student to continue" : value.canCreate ? "Start a subscription" : "Subscription unavailable",
        !selectedStudentId ? "Open the Guardian Dashboard to link a student, then return here."
          : value.canCreate ? "Choose a plan and a card for the selected student. Each student has their own subscription." : $("#current-plan-description").textContent,
        value.canCreate ? "" : "warning");
      if (value.cancellation?.state === "cancelled") {
        banner("Subscription cancelled", `No further payments will be taken for the cancelled subscription. ${value.cancellation.accessUntil
          ? "Existing access ends " + date(value.cancellation.accessUntil) + ". " : ""}Choose a plan to subscribe again.`, "warning");
      }
    }
    $("#refresh-payment-button").hidden = false; status(); return true;
  } catch (error) {
    if (requestGeneration === generation) {status(); showLookupError(error); $("#refresh-payment-button").hidden = false;}
    return false;
  } finally {if (requestGeneration === generation) setBusy(false);}
}
async function finishStudentCheckout(pending = readStorage("studentCheckout"), requestGeneration = generation) {
  if (!pending || !userId || pending.studentId !== selectedStudentId || requestGeneration !== generation) return;
  setBusy(true); setError(); status("Creating this student's subscription and checking the initial payment...");
  writeStorage("studentCheckout", {...pending, stage: "creating"}); checkoutUncertain = true;
  try {
    const result = await createStripeStudentSubscription({studentId: pending.studentId, planId: pending.planId,
      quoteReference: pending.quoteReference, idempotencyReference: pending.attempt,
      ...(pending.setupIntentReference ? {setupIntentReference: pending.setupIntentReference} : {}),
      ...(pending.savedCardReference ? {savedCardReference: pending.savedCardReference} : {})});
    if (requestGeneration !== generation) return;
    writeStorage("studentCheckout", null);
    const destination = new URL(["active", "trialing"].includes(result.status)
      ? "./manage_subscription_payment.html" : "../complete_subscription_payment/complete_subscription_payment.html", location.href);
    destination.searchParams.set("studentId", selectedStudentId);
    destination.searchParams.set("subscriptionReference", result.subscriptionReference);
    location.assign(destination.href);
  } catch (error) {
    if (requestGeneration !== generation) return;
    $("#finish-student-subscription").hidden = false;
    setError(friendlyError(error)); status("Subscription creation is not confirmed. Check and finish setup before starting another checkout.");
  } finally {if (requestGeneration === generation) setBusy(false);}
}
async function beginStudentCheckout() {
  if (busy || form || !userId || !selection?.canCreate || checkoutUncertain) return;
  const plan = checkoutPlan(); if (!plan) return;
  const requestGeneration = generation, pending = {studentId: selectedStudentId, planId: plan.planId,
    quoteReference: plan.quoteReference, attempt: crypto.randomUUID(), stage: "preparing"};
  if ($("#checkout-saved-card").checked && selection.savedCard) {
    await finishStudentCheckout({...pending, savedCardReference: selection.savedCard.paymentMethodReference}, requestGeneration); return;
  }
  setBusy(true); setError(); status("Opening secure card setup for this student's subscription...");
  try {
    writeStorage("studentCheckout", pending);
    const result = await prepareStripeStudentSubscription({studentId: pending.studentId, planId: pending.planId,
      quoteReference: pending.quoteReference, idempotencyReference: pending.attempt});
    if (requestGeneration !== generation) return;
    $("#card-form-section").hidden = false;
    $("#card-form-heading").textContent = "Card for the new subscription";
    $("#card-form-description").textContent = `${planLabel(plan)}. Save this card and create the selected student's subscription.`;
    $("#card-submit-button").textContent = "Save card and create subscription";
    const mounted = await mountSetupPaymentElement({clientSecret: result.clientSecret, containerSelector: "#card-entry-container"});
    if (requestGeneration !== generation) {disposePaymentElement(mounted); return;}
    form = {...pending, purpose: "create", setupIntentReference: result.setupIntentReference, contextReference: mounted.contextReference};
    writeStorage("studentCheckout", {...pending, setupIntentReference: result.setupIntentReference, stage: "entry"});
    status(); $("#card-form-section").scrollIntoView({behavior: "smooth", block: "nearest"});
  } catch (error) {
    if (requestGeneration === generation) {closeForm(); setError(friendlyError(error)); status();}
  } finally {if (requestGeneration === generation) setBusy(false);}
}
$("#linked-student-select").addEventListener("change", () => {
  if (busy || form || !selection?.students.some(student => student.studentId === $("#linked-student-select").value)) return;
  const url = new URL("./manage_subscription_payment.html", location.href);
  url.searchParams.set("studentId", $("#linked-student-select").value); location.assign(url.href);
});
$("#subscription-plan-select").addEventListener("change", renderCheckoutPrice);
$("#change-subscription-plan-select").addEventListener("change", renderChangePlanPrice);
$("#change-student-subscription-plan").addEventListener("click", async () => {
  if (busy || form || !userId || !selection?.canChangePlan) return;
  const plan = changePlanChoice(), requestGeneration = generation; if (!plan) return;
  setBusy(true); setError(); status("Scheduling the plan for the next renewal...");
  try {
    const result = await changeStripeStudentSubscriptionPlan({studentId: selectedStudentId, planId: plan.planId,
      quoteReference: plan.quoteReference, idempotencyReference: crypto.randomUUID()});
    if (requestGeneration !== generation) return;
    selection = result; renderPlanChoices();
    status(result.nextPlan?.state === "scheduled"
      ? "The new plan is scheduled for the next renewal. Your current paid period is unchanged; no payment was submitted."
      : "Check the pending plan update before making another change.");
  } catch (error) {
    if (requestGeneration === generation) {setError(friendlyError(error)); status("The plan change is not confirmed. Refresh to check its status before trying again.");}
  } finally {if (requestGeneration === generation) setBusy(false);}
});
for (const radio of ["#checkout-saved-card", "#checkout-new-card"]) $(radio).addEventListener("change", renderCheckoutPrice);
$("#create-student-subscription").addEventListener("click", beginStudentCheckout);
$("#finish-student-subscription").addEventListener("click", () => {if (!busy && !form) finishStudentCheckout();});
function invoiceAttempt() {
  if (!memoryAttempt) memoryAttempt = readStorage("invoiceRetry") || crypto.randomUUID();
  writeStorage("invoiceRetry", memoryAttempt);
  return memoryAttempt;
}
async function refreshAfterPayment(requestGeneration, message = "") {
  if (requestGeneration !== generation) return;
  closeForm(); setBusy(false); await loadDetails(true);
  if (requestGeneration === generation && message) status(message);
}
$("#retry-payment-button").addEventListener("click", async () => {
  if (busy || form || paymentUncertain || !details?.renewal?.canRetry || !details.linkedInvoiceIsCurrent) return;
  const requestGeneration = generation;
  setBusy(true); setError(); status("Attempting payment with the current card...");
  try {
    const result = await retryStripeSubscriptionPayment({subscriptionReference,
      invoiceReference: details.renewal.invoiceReference, idempotencyReference: invoiceAttempt(),
      ...(recoveryV2() ? recoveryPlanInput() : {})});
    if (requestGeneration !== generation) return;
    if (["retry_payment", "replace_payment_method"].includes(result.action)) {
      writeStorage("invoiceRetry", null); memoryAttempt = null;
    }
    await refreshAfterPayment(requestGeneration);
  } catch (error) {
    if (requestGeneration !== generation) return;
    paymentUncertain = true; setError(friendlyError(error)); status("Check payment status before another payment attempt.");
  } finally {if (requestGeneration === generation) setBusy(false);}
});
$("#confirm-payment-button").addEventListener("click", async () => {
  if (busy || form || !details?.linkedInvoiceIsCurrent || details?.renewal?.action !== "confirm_payment") return;
  const requestGeneration = generation;
  setBusy(true); setError(); status("Opening bank authentication...");
  try {
    const action = details.renewal.requiresActionFetch ? await getStripeSubscriptionPaymentAction({subscriptionReference,
      invoiceReference: details.renewal.invoiceReference}) : details.renewal;
    if (requestGeneration !== generation) return;
    if (action.action !== "confirm_payment") {setBusy(false); await loadDetails(); return;}
    await confirmSubscriptionPayment({paymentClientSecret: action.paymentClientSecret,
      returnUrl: returnUrl(action.invoiceReference), authenticationOnly: true});
    await refreshAfterPayment(requestGeneration);
  } catch (error) {
    if (requestGeneration !== generation) return;
    writeStorage("invoiceRetry", null); memoryAttempt = null;
    paymentUncertain = true; setError(friendlyError(error)); status("Check payment status before another attempt.");
  } finally {if (requestGeneration === generation) setBusy(false);}
});
async function beginCardForm(purpose) {
  if (busy || form || !userId) return;
  if (purpose === "save" && !details?.canChangeCard) return;
  if (purpose === "pay" && (!details?.renewal?.canPayWithNewCard || paymentUncertain || !details.linkedInvoiceIsCurrent)) return;
  const requestGeneration = generation;
  setBusy(true); setError(); status("Opening secure card entry...");
  try {
    let clientSecret, setupIntentReference;
    const cardChangeScope = purpose === "save" ? selectedCardScope() : "subscription";
    if (purpose === "save") {
      const pending = readStorage("cardSetup");
      const attempt = pending?.stage === "creating" && (pending.cardChangeScope || "subscription") === cardChangeScope
        ? pending.attempt : crypto.randomUUID();
      writeStorage("cardSetup", {attempt, stage: "creating", cardChangeScope});
      const result = await createStripeSubscriptionCardSetup({subscriptionReference, idempotencyReference: attempt,
        ...(cardChangeScope === "all_students" ? {cardChangeScope} : {})});
      if (requestGeneration !== generation) return;
      ({clientSecret, setupIntentReference} = result);
      if (cardChangeScope === "all_students" && result.cardChangeTargets) {
        details = {...details, cardChangeTargets: result.cardChangeTargets}; renderCardScope();
      }
      writeStorage("cardSetup", {setupIntentReference, stage: "entry", cardChangeScope});
    } else {
      const prepared = recoveryV2() ? await prepareStripeRenewalPayment({subscriptionReference,
        invoiceReference: details.renewal.invoiceReference, ...recoveryPlanInput(), idempotencyReference: invoiceAttempt()}) : null;
      const action = prepared ? prepared.renewal : await getStripeSubscriptionPaymentAction({subscriptionReference,
        invoiceReference: details.renewal.invoiceReference, paymentMethodChoice: "new_card"});
      if (requestGeneration !== generation) return;
      if (prepared) render(prepared);
      if (action.action !== "enter_new_card") {
        setBusy(false); await loadDetails();
        status("The invoice status changed. Review the latest payment details."); return;
      }
      clientSecret = action.paymentClientSecret;
    }
    $("#card-form-section").hidden = false;
    $("#card-form-heading").textContent = purpose === "save" ? "Change card for future payments" : "Pay this renewal with a new card";
    $("#card-form-description").textContent = purpose === "save"
      ? cardChangeScope === "all_students"
        ? "Save this card for all the eligible student subscriptions listed above. This action does not submit an invoice payment."
        : "Save this card for this student's subscription. This action does not submit an invoice payment."
      : "Pay the invoice shown above and save the successful card for future renewals of this subscription.";
    $("#card-submit-button").textContent = purpose === "save" ? cardChangeScope === "all_students" ? "Save card for all listed students" : "Save card for future payments"
      : `Pay ${amount(details.renewal.amountDue, details.renewal.currency)} and save card`;
    const mounted = await mountSetupPaymentElement({clientSecret, containerSelector: "#card-entry-container"});
    if (requestGeneration !== generation) {disposePaymentElement(mounted); return;}
    form = {purpose, cardChangeScope, contextReference: mounted.contextReference, setupIntentReference,
      invoiceReference: details.renewal?.invoiceReference};
    $("#finish-save-button").hidden = true;
    status(); $("#card-form-section").scrollIntoView({behavior: "smooth", block: "nearest"});
  } catch (error) {
    if (requestGeneration === generation) {closeForm(); setError(friendlyError(error)); status();}
  } finally {if (requestGeneration === generation) setBusy(false);}
}
async function finishSaving(setupIntentReference, requestGeneration = generation,
  cardChangeScope = readStorage("cardSetup")?.cardChangeScope || "subscription") {
  if (cardChangeScope === "all_students" && details?.canChangeAllStudents) {
    $("#card-scope-all").checked = true; renderCardScope();
  }
  setBusy(true); setError(); status("Saving the default card for future charges...");
  // A changed funding method is a new user intent, not a transport replay of
  // the earlier card's attempt. A fresh status check still gates any repayment.
  writeStorage("invoiceRetry", null); memoryAttempt = null;
  writeStorage("cardSetup", {setupIntentReference, stage: "updating", cardChangeScope});
  try {
    const result = await updateStripeSubscriptionPaymentMethod({...references(), setupIntentReference,
      ...(cardChangeScope === "all_students" ? {cardChangeScope} : {})});
    if (requestGeneration !== generation) return;
    const partial = !!result.cardUpdateResult?.failed.length;
    if (!partial) writeStorage("cardSetup", null);
    closeForm(); render(result);
    $("#finish-save-button").hidden = !partial;
    status(partial ? "Some card updates could not be confirmed. Review the results below and choose Finish saving card to retry."
      : cardChangeScope === "all_students" ? "Card update completed for the selected student subscriptions. Review each result below. No invoice payment was submitted."
        : "Saved card updated for this student. This action did not submit an invoice payment.");
  } catch (error) {
    if (requestGeneration !== generation) return;
    closeForm(); $("#finish-save-button").hidden = false;
    setError(friendlyError(error)); status("The saved-card update is not confirmed. Check its status or finish saving again.");
  } finally {if (requestGeneration === generation) setBusy(false);}
}
$("#card-submit-button").addEventListener("click", async () => {
  if (busy || !form?.contextReference || !userId) return;
  const requestGeneration = generation, active = {...form};
  setBusy(true); setError(); $("#card-form-error").hidden = true;
  try {
    if (active.purpose === "create") {
      writeStorage("studentCheckout", {...readStorage("studentCheckout"), stage: "confirming"});
      const result = await confirmSetup({contextReference: active.contextReference, returnUrl: returnUrl(null)});
      if (requestGeneration !== generation) return;
      if (result.status !== "succeeded" || result.setupIntentReference !== active.setupIntentReference) {
        throw Object.assign(Error("Card setup incomplete"), {code: "failed-precondition"});
      }
      const pending = readStorage("studentCheckout"); closeForm(); await finishStudentCheckout(pending, requestGeneration);
    } else if (active.purpose === "save") {
      writeStorage("cardSetup", {setupIntentReference: active.setupIntentReference, stage: "confirming", cardChangeScope: active.cardChangeScope});
      const result = await confirmSetup({contextReference: active.contextReference, returnUrl: returnUrl()});
      if (requestGeneration !== generation) return;
      if (result.status !== "succeeded" || result.setupIntentReference !== active.setupIntentReference) {
        throw Object.assign(Error("Card setup incomplete"), {code: "failed-precondition"});
      }
      await finishSaving(active.setupIntentReference, requestGeneration);
    } else {
      await confirmSubscriptionPayment({contextReference: active.contextReference, returnUrl: returnUrl(active.invoiceReference)});
      await refreshAfterPayment(requestGeneration);
    }
  } catch (error) {
    if (requestGeneration !== generation) return;
    const validationError = ["incomplete_number", "incomplete_cvc", "incomplete_expiry"].includes(code(error));
    if (validationError) {
      $("#card-form-error").textContent = friendlyError(error); $("#card-form-error").hidden = false;
      if (active.purpose === "save") writeStorage("cardSetup", {setupIntentReference: active.setupIntentReference, stage: "entry", cardChangeScope: active.cardChangeScope});
      if (active.purpose === "create") writeStorage("studentCheckout", {...readStorage("studentCheckout"), stage: "entry"});
    } else if (active.purpose === "create") {
      closeForm(); $("#finish-student-subscription").hidden = false;
      setError(friendlyError(error)); status("Card setup is not confirmed. Check and finish subscription setup before trying another payment.");
    } else if (active.purpose === "save") {
      closeForm(); $("#finish-save-button").hidden = false;
      setError(friendlyError(error)); status("Card setup was not confirmed. Check its status before starting again.");
    } else {
      await refreshAfterPayment(requestGeneration);
      if (requestGeneration === generation && details?.paymentState !== "paid") setError(friendlyError(error));
    }
  } finally {if (requestGeneration === generation) setBusy(false);}
});
$("#card-change-scope").addEventListener("change", renderCardScope);
$("#change-card-button").addEventListener("click", () => beginCardForm("save"));
$("#use-new-card-button").addEventListener("click", () => beginCardForm("pay"));
$("#card-cancel-button").addEventListener("click", async () => {
  if (busy) return;
  const cancelPending = recoveryV2() && form?.purpose === "pay";
  closeForm(true); setBusy(false); status();
  if (cancelPending) await cancelRecovery("payment");
});
$("#renewal-plan-select").addEventListener("change", () => {
  if (busy || form || details?.recoveryPending) return;
  writeStorage("invoiceRetry", null); memoryAttempt = null; renderRecoveryPrice();
});
async function cancelRecovery(kind) {
  if (busy || form || !userId || !recoveryV2()) return;
  const requestGeneration = generation;
  setBusy(true); setError(); status("Checking and cancelling the unfinished payment safely...");
  try {
    const result = await (kind === "renewal" ? cancelStripeRenewalRecovery : cancelStripeRenewalPayment)(references());
    if (requestGeneration !== generation) return;
    render(result);
    if (!result.recoveryPending) {writeStorage("invoiceRetry", null); memoryAttempt = null;}
    status(result.recoveryPending ? "The payment cannot yet be cancelled. Check its status before another attempt."
      : result.paymentState === "paid" ? "Payment was already completed successfully."
        : kind === "renewal" ? "Automatic payment retries have stopped. Billing remains paused." : "Pending payment cancelled. You can choose a plan and try again.");
  } catch (err) {if (requestGeneration === generation) {setError(friendlyError(err)); status("Cancellation is not confirmed. Check payment status before trying again.");}}
  finally {if (requestGeneration === generation) setBusy(false);}
}
$("#cancel-pending-renewal-button").addEventListener("click", () => cancelRecovery("payment"));
$("#cancel-renewal-button").addEventListener("click", () => cancelRecovery("renewal"));
$("#cancel-subscription-button").addEventListener("click", () => {
  if (busy || form || !details?.canCancelSubscription) return;
  $("#subscription-cancellation-confirmation-text").textContent = `Cancel ${details.studentName || "this student"}'s subscription now? `
    + (details.accessUntil ? "Access continues until " + date(details.accessUntil) + ". " : "")
    + "Subscribing again will create a new subscription. Other students are unaffected.";
  $("#subscription-cancellation-confirmation").hidden = false;
});
$("#keep-subscription-button").addEventListener("click", () => {$("#subscription-cancellation-confirmation").hidden = true;});
$("#confirm-subscription-cancellation").addEventListener("click", async () => {
  if (busy || form || !userId || !details?.canCancelSubscription || $("#subscription-cancellation-confirmation").hidden) return;
  const requestGeneration = generation;
  setBusy(true); setError(); status("Cancelling this student's subscription in Stripe...");
  try {
    const result = await cancelStripeStudentSubscription({subscriptionReference});
    if (requestGeneration !== generation) return;
    render(result);
    if (result.cancellation?.state === "cancelled") {
      writeStorage("invoiceRetry", null); writeStorage("cardSetup", null); writeStorage("studentCheckout", null);
      memoryAttempt = null; hidePrivateDetails(); setBusy(false); await loadSelection();
    } else status("Cancellation is pending. Check payment status again shortly; do not start another payment.");
  } catch (error) {
    if (requestGeneration !== generation) return;
    hidePrivateDetails(); paymentUncertain = true;
    setError(friendlyError(error)); status("Cancellation is not confirmed. Check payment status before trying again.");
  } finally {if (requestGeneration === generation) setBusy(false);}
});
$("#finish-save-button").addEventListener("click", () => {
  const pending = readStorage("cardSetup");
  if (!busy && pending?.setupIntentReference) finishSaving(pending.setupIntentReference);
});
$("#refresh-payment-button").addEventListener("click", async () => {
  updateChecks = 0;
  if (await loadSelection(true)) await loadDetails();
});

if ((subscriptionReference !== null && !/^sub_[a-zA-Z0-9_]+$/.test(subscriptionReference))
  || (requestedStudentId !== null && (!requestedStudentId.trim() || requestedStudentId.includes("/") || requestedStudentId.length > 500))
  || (linkedInvoiceReference !== null && !/^in_[a-zA-Z0-9_]+$/.test(linkedInvoiceReference))) {
  banner("Invalid payment link", "Choose a linked student or use a valid subscription link.", "error");
  setBusy(false);
} else {
  onFirebaseAuthStateChanged(async user => {
    if (userId === (user?.uid || null) && user) return;
    generation++; updateChecks = 0; hidePrivateDetails(); userId = user?.uid || null; paymentUncertain = false;
    selection = null; checkoutUncertain = false; selectedStudentId = requestedStudentId;
    subscriptionReference = originalSubscriptionReference; linkedInvoiceReference = originalInvoiceReference;
    $("#student-selector-panel").hidden = true; $("#subscription-plan-section").hidden = true;
    $("#linked-student-select").replaceChildren(); $("#subscription-plan-select").replaceChildren();
    $("#current-plan-description").textContent = ""; $("#selected-plan-price").textContent = "";
    setError(); status(); setBusy(false);
    if (!userId) {
      banner("Sign in to continue", "Use the guardian account that owns this subscription.", "warning");
      $("#sign-in-panel").hidden = false; $("#refresh-payment-button").hidden = true; return;
    }
    const requestGeneration = generation;
    $("#sign-in-panel").hidden = true;
    if (!await loadSelection() || requestGeneration !== generation) return;
    if (subscriptionReference) await loadDetails(returnedPayment);
    if (requestGeneration !== generation) return;
    const checkout = readStorage("studentCheckout");
    if (!subscriptionReference && checkout && ["confirming", "creating"].includes(checkout.stage)) {
      if (returnedSetupIntent && returnedSetupIntent !== checkout.setupIntentReference) {
        setError("This bank return does not match the subscription setup started here."); return;
      }
      await finishStudentCheckout(checkout, requestGeneration); return;
    }
    if (!details) return;
    const pending = readStorage("cardSetup");
    if (pending?.setupIntentReference && ["confirming", "updating"].includes(pending.stage)) {
      if (returnedSetupIntent && returnedSetupIntent !== pending.setupIntentReference) {
        setError("This bank return does not match the card setup started here."); return;
      }
      await finishSaving(pending.setupIntentReference, requestGeneration);
    }
  });
}
