import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const pageHtml = fs.readFileSync(
  new URL(
    "./pages/complete_subscription_payment/" +
      "complete_subscription_payment.html",
    import.meta.url
  ),
  "utf8"
);
const pageScript = fs.readFileSync(
  new URL(
    "./pages/complete_subscription_payment/" +
      "complete_subscription_payment.js",
    import.meta.url
  ),
  "utf8"
);

test("complete-payment page loads Firebase Auth, Functions, and Stripe", () => {
  assert.match(pageHtml, /firebase-auth-compat\.js/);
  assert.match(pageHtml, /firebase-functions-compat\.js/);
  assert.match(pageHtml, /https:\/\/js\.stripe\.com\/v3\//);
  assert.match(pageHtml, /id="payment-status"/);
  assert.match(pageHtml, /id="confirm-payment-button"/);
  assert.match(pageHtml, /id="refresh-payment-button"/);
  assert.match(pageHtml, /id="sign-in-panel"/);
});

test("complete-payment page loads the action for its URL subscription", () => {
  assert.match(
    pageScript,
    /SUBSCRIPTION_QUERY_PARAMETER\s*=\s*"subscriptionReference"/
  );
  assert.match(pageScript, /onFirebaseAuthStateChanged/);
  assert.match(
    pageScript,
    /getStripeSubscriptionPaymentAction\(\s*subscriptionReference\s*\)/
  );
  assert.match(pageScript, /activeUserId\s*=\s*authUser\.uid/);
});

test("complete-payment page confirms only a returned action secret", () => {
  assert.match(
    pageScript,
    /currentPaymentAction\?\.action\s*!==\s*"confirm_payment"/
  );
  assert.match(
    pageScript,
    /await confirmSubscriptionPayment\(\{\s*paymentClientSecret,/
  );
  assert.match(pageScript, /returnUrl:\s*currentReturnUrl\(\)/);
  assert.doesNotMatch(
    pageHtml,
    /payment[_-]client[_-]secret/i
  );
});

test("complete-payment page removes Stripe redirect secrets from its URL", () => {
  assert.match(pageScript, /"payment_intent_client_secret"/);
  assert.match(pageScript, /window\.history\.replaceState/);
  assert.match(
    pageScript,
    /returnUrl\.searchParams\.set\(\s*SUBSCRIPTION_QUERY_PARAMETER/
  );
});

test("complete-payment page renders every backend action", () => {
  [
    "confirm_payment",
    "complete",
    "wait",
    "replace_payment_method"
  ].forEach((action) => {
    assert.match(pageScript, new RegExp('case "' + action + '"'));
  });
  assert.match(pageScript, /Payment unavailable/);
});
