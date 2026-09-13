import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const pageHtml = fs.readFileSync(
  new URL(
    "./pages/admin/stripe_payment_test.html",
    import.meta.url
  ),
  "utf8"
);
const pageScript = fs.readFileSync(
  new URL(
    "./pages/admin/stripe_payment_test.js",
    import.meta.url
  ),
  "utf8"
);

test("Stripe test page exposes Step 6 subscription confirmation", () => {
  assert.match(
    pageHtml,
    /id="confirm-subscription-payment-form"/
  );
  assert.match(
    pageHtml,
    /id="confirm-subscription-payment-client-secret"/
  );
  assert.match(
    pageHtml,
    /id="confirm-subscription-payment-return-url"/
  );
  assert.match(
    pageHtml,
    /id="confirm-subscription-payment-consent"/
  );
  assert.match(
    pageHtml,
    /id="confirmed-subscription-payment-status"/
  );
  assert.match(
    pageHtml,
    /<span class="step-number danger-number">7<\/span>/
  );
});

test("Step 6 calls the feature API and renders paymentStatus", () => {
  assert.match(pageScript, /confirmSubscriptionPayment/);
  assert.match(
    pageScript,
    /paymentClientSecret:\s*confirmSubscriptionClientSecretEl\.value/
  );
  assert.match(
    pageScript,
    /returnUrl:\s*confirmSubscriptionReturnUrlEl\.value/
  );
  assert.match(
    pageScript,
    /confirmedSubscriptionPaymentStatus\.textContent\s*=\s*paymentStatus/
  );
});

test("Step 5 supplies its payment client secret to Step 6", () => {
  assert.match(
    pageScript,
    /confirmSubscriptionClientSecretEl\.value\s*=\s*result\.paymentClientSecret\s*\|\|\s*""/
  );
  assert.match(
    pageScript,
    /isCreatingSubscription\s*=\s*false;\s*updateStripeSetupControls\(\);/
  );
});
