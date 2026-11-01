const assert = require("node:assert/strict");
const {before, after, test} = require("node:test");
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const publicRoot = path.resolve(__dirname, "../../../public");
const pagePath = "/features/stripe_payment/pages/guardian/manage_subscription_payment.html";
const oldRetryPath = "/features/stripe_payment/pages/guardian/retry_subscription_payment.html";
const completePagePath = "/features/stripe_payment/pages/complete_subscription_payment/complete_subscription_payment.html";
const suspendedPagePath = "/features/student/pages/subscription_suspended/subscription_suspended.html";
const paymentAdminPath = "/features/payment/pages/admin/payment_admin.html";
let browser, server, origin;
const mocks = {
  "/features/payment/payment_module.js": `
    export const paymentModes = {TEST: "test", PROD: "prod"};
    export const paymentProviders = {STRIPE: "stripe"};
    export const defaultRenewalRetryPolicy = {maxRetries: 3, intervalHours: 24, gracePeriodHours: 72};
    export async function getPaymentConfig() {return window.fixture.paymentConfig || null;}
    export async function savePaymentConfig(input) {window.configSaves.push(input); return {...input, updatedAt: new Date()};}
  `,
  "/features/guardian/guardian_module.js": `
    export const getGuardianById = async () => ({name: "Guardian", email: "guardian@example.test", authType: "email"});
    export function onGuardianAuthStateChanged(callback) {callback({uid: "owner"});}
    export async function signOutGuardian() {}
  `,
  "/features/student/student_module.js": `export const studentLevels = {primary: "primary"}; export async function searchStudents() {return [];}`,
  "/features/guardian_student_link/guardian_student_link_module.js": `
    export const guardianStudentRelationships = {parent: "parent"};
    export async function linkStudentToGuardian() {}
    export async function listLinkedStudentsForGuardian() {return [{link: {relationship: "parent"},
      student: {id: "student-a", name: "Alice", level: "primary", grade: 1, yearOfBirth: 2019}}];}
  `,
  "/features/site_admin/site_admin_module.js": `export async function isCurrentUserSiteAdmin() {return {isAdmin: false};}`,
  "/features/syllabus_subscription/student_subscription_module.js": `
    export async function getStudentSubscription() {return {paymentProvider: "stripe", paymentSubscriptionReference: "sub_owner"};}
  `,
  "/features/syllabus_subscription/student_access_module.js": `
    export function watchStudentSubscriptionAccess(_id, callback, onError) {
      window.setBillingAccess = callback;
      if (window.fixture.accessError) onError(); else callback({allowed: window.fixture.accessAllowed === true});
      return () => {};
    }
  `,
  "/utils/firebase/firebase_auth.js": `export const getFirebaseAuth = () => ({signOut: async () => window.setAuth(null)}); export function onFirebaseAuthStateChanged(callback) {
    window.setAuth = callback; callback(window.fixture.signedOut ? null : {uid: "owner"}); return () => {};
  }`,
  "/features/stripe_payment_subscription/stripe_payment_subscription_module.js": `
    function clone(v) {return structuredClone(v);}
    export async function prepareStripeRenewalPayment(input) {
      window.actionLoads.push({...input, action: "new_card"});
      Object.assign(window.fixture.details, {recoveryPending: true, canCancelPendingPayment: true});
      Object.assign(window.fixture.details.renewal, {action: "enter_new_card", canRetry: false,
        paymentClientSecret: "pi_due_secret_private", attemptInvoiceReference: "in_fresh"});
      return clone(window.fixture.details);
    }
    export async function cancelStripeRenewalPayment(input) {
      window.actionLoads.push({...input, action: "cancel_payment"});
      if (!window.fixture.cannotCancel) {
        Object.assign(window.fixture.details, {recoveryPending: false, canCancelPendingPayment: false, paymentState: "failed"});
        Object.assign(window.fixture.details.renewal, {action: "retry_payment", canRetry: true, paymentClientSecret: null});
      }
      return clone(window.fixture.details);
    }
    export async function cancelStripeRenewalRecovery(input) {
      window.actionLoads.push({...input, action: "cancel_renewal"});
      Object.assign(window.fixture.details, {renewalCancelled: true, canCancelRenewal: false});
      return clone(window.fixture.details);
    }
    export async function cancelStripeStudentSubscription(input) {
      window.subscriptionCancellations.push(input);
      if (window.fixture.deferCancellation) await new Promise(resolve => window.releaseCancellation = resolve);
      if (window.fixture.cancellationError) throw {code: "functions/unavailable"};
      const pending = window.fixture.cancellationPending;
      window.fixture.details.cancellation = {state: pending ? "pending" : "cancelled", requestedAt: "2030-11-10T00:00:00Z",
        cancelledAt: pending ? null : "2030-11-10T00:00:00Z", accessUntil: "2030-12-01T00:00:00Z"};
      Object.assign(window.fixture.details, {canCancelSubscription: false, canChangeCard: false, renewal: null,
        subscriptionStatus: pending ? "active" : "canceled", nextChargeAt: null});
      if (!pending) window.fixture.cancelled = true;
      return clone(window.fixture.details);
    }
    export async function getStripeGuardianSubscriptionOptions(input) {
      window.optionLoads.push(input);
      if (window.fixture.optionsError) throw {code: window.fixture.optionsError};
      if (window.fixture.deferOptions) return new Promise(resolve => window.pendingOptions.push(resolve));
      if (window.fixture.options) return clone(window.fixture.options);
      const students = window.fixture.noStudents ? [] : [{studentId: "student-a", studentName: "Alice", country: "Malaysia"},
        {studentId: "student-b", studentName: "Ben", country: "Malaysia"}];
      const selectedStudentId = input.studentId || students[0]?.studentId || null;
      const subscriptionReference = selectedStudentId === "student-a" && !window.fixture.cancelled ? window.fixture.details.subscriptionReference : selectedStudentId === "student-b" && window.fixture.family ? "sub_second" : null;
      return {students, selectedStudentId, paymentMode: "test", subscriptionReference,
        ...(window.fixture.syncState ? {syncState: clone(window.fixture.syncState)} : {}),
        ...(window.fixture.cancelled || window.fixture.cancellationPending ? {cancellation: clone(window.fixture.details.cancellation)} : {}),
        ...(window.fixture.cancelled ? {firstChargeAt: "2030-12-01T00:00:00Z"} : {}),
        canCreate: !!selectedStudentId && !subscriptionReference, currentPlanId: subscriptionReference ? "monthly" : null,
        canChangePlan: !!subscriptionReference && window.fixture.healthy === true, nextPlan: window.fixture.nextPlan || null, nextRenewalAt: "2030-12-01T00:00:00Z",
        blockedReason: students.length ? null : "no_linked_students",
        savedCard: window.fixture.checkoutSavedCard ? {...window.fixture.details.currentCard, paymentMethodReference: "pm_saved"} : null,
        plans: [{planId: "monthly", name: "Monthly", months: 1, amount: 2500, currency: "myr", quoteReference: "a".repeat(64)},
          {planId: "annual", name: "Annual", months: 12, amount: 24000, currency: "myr", quoteReference: "b".repeat(64)}]};
    }
    export async function changeStripeStudentSubscriptionPlan(input) {
      window.studentPlanChanges.push(input);
      if (window.fixture.changePlanError) throw {code: window.fixture.changePlanError};
      window.fixture.nextPlan = {planId: input.planId, state: "scheduled", effectiveAt: "2030-12-01T00:00:00Z"};
      return getStripeGuardianSubscriptionOptions({studentId: input.studentId});
    }
    export async function prepareStripeStudentSubscription(input) {
      window.studentSetups.push(input);
      return {setupIntentReference: "seti_new", clientSecret: "seti_student_secret_private"};
    }
    export async function createStripeStudentSubscription(input) {
      window.studentCreates.push(input);
      sessionStorage.setItem("rhx.test.studentCreates", JSON.stringify(window.studentCreates));
      if (window.fixture.createStudentError) throw {code: window.fixture.createStudentError};
      return {subscriptionReference: "sub_created", status: "incomplete"};
    }
    function paid(newCard = false) {
      window.fixture.details.paymentState = "paid";
      window.fixture.details.subscriptionStatus = "active";
      window.fixture.details.renewal = {...window.fixture.details.renewal, action: "complete", canRetry: false,
        canPayWithNewCard: false, paymentState: "paid", amountDue: 0, invoiceStatus: "paid", paymentClientSecret: null};
      if (newCard) window.fixture.details.currentCard.last4 = "4444";
    }
    export async function getStripeSubscriptionPaymentDetails(input) {
      window.loads.push(input);
      if (window.fixture.loadError) throw {code: window.fixture.loadError, message: "private backend details"};
      if (window.fixture.deferLoad) return new Promise(resolve => window.pendingLoads.push(resolve));
      const value = clone(window.fixture.details);
      if (input.subscriptionReference === "sub_second") {
        value.subscriptionReference = "sub_second"; value.studentId = "student-b"; value.studentName = "Ben";
        if (value.renewal) value.renewal = {...value.renewal, subscriptionReference: "sub_second", invoiceReference: "in_second"};
      }
      return value;
    }
    export async function getStripeSubscriptionPaymentAction(input) {
      window.actionLoads.push(input);
      if (window.fixture.deferAction) return new Promise(resolve => window.pendingActions.push(resolve));
      if (window.fixture.actionError) throw {code: "functions/unavailable"};
      if (input.paymentMethodChoice === "new_card") return {...clone(window.fixture.details.renewal),
        action: "enter_new_card", paymentClientSecret: "pi_due_secret_private"};
      return window.fixture.deferredAuthentication ? {...clone(window.fixture.details.renewal),
        requiresActionFetch: false, paymentClientSecret: "pi_due_secret_private"} : clone(window.fixture.details.renewal);
    }
    export async function retryStripeSubscriptionPayment(input) {
      window.retries.push(input);
      if (window.fixture.deferRetry) await new Promise(resolve => window.releaseRetry = resolve);
      if (window.fixture.retryError) throw {code: "functions/unavailable"};
      if (window.fixture.behavior === "3ds") {
        window.fixture.details.paymentState = "authentication_required";
        window.fixture.details.renewal = {...window.fixture.details.renewal, action: "confirm_payment", canRetry: false,
          paymentState: "authentication_required", paymentStatus: "requires_action", paymentClientSecret: "pi_due_secret_private"};
      } else if (window.fixture.behavior !== "decline") paid();
      return clone(window.fixture.details.renewal);
    }
    export async function createStripeSubscriptionCardSetup(input) {
      window.setups.push(input); return {setupIntentReference: "seti_new", clientSecret: "seti_new_secret_private",
        ...(input.cardChangeScope === "all_students" ? {cardChangeTargets: clone(window.fixture.setupTargets || window.fixture.details.cardChangeTargets)} : {})};
    }
    export async function updateStripeSubscriptionPaymentMethod(input) {
      window.updates.push(input);
      if (window.fixture.deferUpdate) await new Promise(resolve => window.releaseUpdate = resolve);
      if (window.fixture.updateError) throw {code: "functions/unavailable"};
      window.fixture.details.currentCard.last4 = "4444";
      if (input.cardChangeScope === "all_students") window.fixture.details.cardUpdateResult = {
        scope: "all_students", updated: window.fixture.partialUpdate ? ["sub_owner"] : ["sub_owner", "sub_second"],
        failed: window.fixture.partialUpdate ? ["sub_second"] : [], skipped: []};
      return clone(window.fixture.details);
    }
  `,
  "/features/stripe_payment/stripe_payment_module.js": `
    // Only the existing checkout lookup is retained as a compatibility export.
    // Management queries and mutations must use the subscription feature.
    export {getStripeSubscriptionPaymentAction}
      from "/features/stripe_payment_subscription/stripe_payment_subscription_module.js";
    function paid(newCard = false) {
      window.fixture.details.paymentState = "paid";
      window.fixture.details.subscriptionStatus = "active";
      window.fixture.details.renewal = {...window.fixture.details.renewal, action: "complete", canRetry: false,
        canPayWithNewCard: false, paymentState: "paid", amountDue: 0, invoiceStatus: "paid", paymentClientSecret: null};
      if (newCard) window.fixture.details.currentCard.last4 = "4444";
    }
    export async function mountSetupPaymentElement(input) {
      window.mounts.push(input); document.querySelector(input.containerSelector).textContent = "Secure Stripe card form";
      return {contextReference: input.clientSecret.startsWith("pi_") ? "stripe_setup_context_payment" : "stripe_setup_context_save", mode: "test"};
    }
    export function disposePaymentElement(input) {window.disposed.push(input);}
    export async function confirmSetup(input) {
      window.setupConfirmations.push(input);
      if (window.fixture.setupError) throw {code: window.fixture.setupError};
      if (window.fixture.deferSetup) await new Promise(resolve => window.releaseSetup = resolve);
      return {setupIntentReference: "seti_new", status: "succeeded"};
    }
    export async function confirmSubscriptionPayment(input) {
      window.confirmations.push(input);
      if (window.fixture.deferConfirmation) await new Promise(resolve => window.releaseConfirmation = resolve);
      if (window.fixture.confirmationLost) {paid(); throw {code: "network_error"};}
      if (window.fixture.readFailsAfterConfirmation) {window.fixture.actionError = true; throw {code: "network_error"};}
      if (window.fixture.authError) throw {code: "canceled"};
      if (window.fixture.payError) throw {code: "card_declined"};
      paid(!!input.contextReference);
      return {paymentStatus: "succeeded"};
    }
  `,
};
before(async () => {
  await fs.mkdir("/tmp/rhx-cancellation", {recursive: true});
  await fs.mkdir("/tmp/rhx-initial-confirmation", {recursive: true});
  server = http.createServer(async (req, res) => {
    try {
      const name = new URL(req.url, "http://localhost").pathname;
      if (mocks[name]) {res.setHeader("Content-Type", "text/javascript"); res.end(mocks[name]); return;}
      const filename = path.resolve(publicRoot, "." + name);
      if (!filename.startsWith(publicRoot + path.sep)) {res.writeHead(404).end(); return;}
      if (name === "/features/student/pages/landing/landing.html") {res.setHeader("Content-Type", "text/html");res.end("<html><body>Student home</body></html>");return;}
      let content = await fs.readFile(filename, "utf8");
      if (name.endsWith(".html")) content = content.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "")
        .replace("</body>", `<script type="module" src="./${name === completePagePath
          ? "complete_subscription_payment" : name === suspendedPagePath ? "subscription_suspended" : name === paymentAdminPath ? "payment_admin" : name === "/features/guardian/pages/landing/landing.html"
            ? "landing" : "manage_subscription_payment"}.js"></script></body>`);
      res.setHeader("Content-Type", name.endsWith(".js") ? "text/javascript" : name.endsWith(".css") ? "text/css" : "text/html");
      res.end(content);
    } catch {res.writeHead(404).end();}
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  const {default: puppeteer} = await import("puppeteer");
  browser = await puppeteer.launch({headless: true, executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox", "--disable-dev-shm-usage"]});
});
after(async () => {await browser?.close(); if (server) await new Promise(resolve => server.close(resolve));});
async function open({width = 1360, route = pagePath, query = "?subscriptionReference=sub_owner&invoiceReference=in_due", ...fixture} = {}) {
  const page = await browser.newPage(); await page.setViewport({width, height: 1000});
  await page.evaluateOnNewDocument(fixture => {
    const card = {brand: "visa", last4: "4242", expiryMonth: 12, expiryYear: 2030};
    window.fixture = {details: {subscriptionReference: "sub_owner", subscriptionStatus: "past_due", currentCard: card,
      studentId: "student-a", studentName: "Alice", canChangeCard: true, linkedInvoiceIsCurrent: true, paymentState: "failed", planId: "monthly",
      renewal: {action: "retry_payment", subscriptionReference: "sub_owner", invoiceReference: "in_due", amountDue: 2500,
        currency: "myr", canRetry: true, canPayWithNewCard: true, paymentState: "failed", savedCard: {...card},
        invoiceStatus: "open", failureCode: "insufficient_funds", billingReason: "subscription_cycle"}}, ...fixture};
    if (fixture.healthy) Object.assign(window.fixture.details, {subscriptionStatus: "active", renewal: null,
      paymentState: "paid", nextChargeAt: "2030-12-01T00:00:00Z"});
    if (fixture.syncState) window.fixture.details.syncState = fixture.syncState;
    if (fixture.deferredAuthentication) Object.assign(window.fixture.details.renewal, {action: "confirm_payment",
      paymentState: "authentication_required", canRetry: false, requiresActionFetch: true, paymentClientSecret: null});
    if (fixture.family) Object.assign(window.fixture.details, {canChangeAllStudents: true,
      cardChangeTargets: [{subscriptionReference: "sub_owner", studentId: "student-a", studentName: "Alice", planId: "monthly"},
        {subscriptionReference: "sub_second", studentId: "student-b", studentName: "Ben", planId: "yearly"}]});
    if (fixture.recoveryV2) {
      const d = window.fixture.details;
      Object.assign(d, {applicationStatus: fixture.suspended ? "suspended" : "active", canCancelRenewal: true,
        renewalRecovery: {version: 2, state: "held", firstFailedAt: "2030-10-01T00:00:00Z", graceUntil: "2030-10-04T00:00:00Z"},
        renewalRetry: {state: "awaiting_action", maxRetries: 3, intervalHours: 24, attemptsMade: 0, graceUntil: "2030-10-04T00:00:00Z"}});
      if (fixture.automaticAuthentication) d.renewal.failureCode = "authentication_required";
      if (fixture.permanentDecline) Object.assign(d.renewal, {failureCode: "stolen_card", canRetry: false, requiresNewCard: true});
      if (fixture.pendingRecovery) {
        Object.assign(d, {canCancelPendingPayment: true, recoveryPending: true, canChangeCard: false, paymentState: "processing"});
        Object.assign(d.renewal, {action: "wait", canRetry: false, canPayWithNewCard: false});
      }
    }
    window.loads = []; window.actionLoads = []; window.retries = []; window.confirmations = []; window.pendingLoads = []; window.pendingActions = [];
    window.subscriptionCancellations = [];
    if (fixture.cancellable) Object.assign(window.fixture.details, {canCancelSubscription: true, accessUntil: "2030-12-01T00:00:00Z"});
    window.setups = []; window.mounts = []; window.setupConfirmations = []; window.updates = []; window.disposed = [];
    window.configSaves = []; window.optionLoads = []; window.pendingOptions = []; window.studentCreates = []; window.studentSetups = []; window.studentPlanChanges = [];
    if (fixture.pendingStudentCheckout) sessionStorage.setItem("rhx.stripe.studentCheckout.v1:owner:test:student:student-b", JSON.stringify(fixture.pendingStudentCheckout));
    if (fixture.pendingSetup) sessionStorage.setItem("rhx.stripe.cardSetup.v1:owner:sub_owner", JSON.stringify(fixture.pendingSetup));
  }, fixture);
  await page.goto(origin + route + query, {waitUntil: "networkidle0"}); return page;
}
async function ready(page) {await page.waitForFunction(() => !document.querySelector("#change-card-button").disabled);}
async function formReady(page) {await page.waitForFunction(() => !document.querySelector("#card-submit-button").disabled);}

test("schema status loads normally and Check payment status requests exactly one Stripe refresh", async () => {
  const page = await open({healthy: true});
  try {
    await ready(page);
    assert.equal(await page.evaluate(() => window.optionLoads.some(v => v.refreshFromStripe) || window.loads.some(v => v.refreshFromStripe)), false);
    await page.click("#refresh-payment-button"); await ready(page);
    assert.equal(await page.evaluate(() => window.optionLoads.filter(v => v.refreshFromStripe === true).length), 1);
    assert.equal(await page.evaluate(() => window.loads.some(v => v.refreshFromStripe)), false);
    assert.equal(await page.evaluate(() => window.retries.length + window.confirmations.length), 0);
  } finally {await page.close();}
});
test("pending schema updates show last confirmation and poll without querying Stripe or paying", async () => {
  const page = await open({healthy: true, syncState: {state: "pending", lastConfirmedAt: "2030-11-01T00:00:00Z", unavailable: true}});
  try {
    await ready(page);
    assert.match(await page.$eval("#payment-sync-notice", el => el.textContent), /Updating payment status.*last confirmed.*temporarily unavailable/);
    assert.match(await page.$eval("#checked-at", el => el.textContent), /Last confirmed/);
    assert.equal(await page.$eval("#payment-summary", el => el.hidden), false);
    await page.waitForFunction(() => window.loads.length >= 2, {timeout: 9000});
    assert.equal(await page.evaluate(() => window.optionLoads.some(v => v.refreshFromStripe) || window.loads.some(v => v.refreshFromStripe)), false);
    assert.equal(await page.evaluate(() => window.retries.length + window.confirmations.length), 0);
    await page.evaluate(() => window.setAuth(null));
    assert.equal(await page.$eval("#payment-sync-notice", el => el.hidden), true);
  } finally {await page.close();}
});
test("deferred bank authentication fetches a fresh action only after guardian clicks", async () => {
  const page = await open({deferredAuthentication: true});
  try {
    await ready(page);
    assert.equal(await page.evaluate(() => window.actionLoads.length + window.confirmations.length), 0);
    await page.click("#confirm-payment-button");
    await page.waitForFunction(() => window.confirmations.length === 1);
    assert.equal(await page.evaluate(() => window.actionLoads.length), 1);
    assert.equal(await page.evaluate(() => window.confirmations[0].paymentClientSecret), "pi_due_secret_private");
    assert.equal(await page.evaluate(() => window.retries.length), 0);
  } finally {await page.close();}
});
test("pending confirmation retains failed-renewal details but blocks a second payment", async () => {
  const page = await open({syncState: {state: "pending", lastConfirmedAt: "2030-11-01T00:00:00Z"}});
  try {
    await ready(page);
    assert.equal(await page.$eval("#payment-summary", el => el.hidden), false);
    assert.equal(await page.$eval("#retry-payment-button", el => el.disabled), true);
    assert.equal(await page.$eval("#use-new-card-button", el => el.disabled), true);
    assert.equal(await page.evaluate(() => window.retries.length + window.confirmations.length), 0);
  } finally {await page.close();}
});

test("desktop and mobile explain the failed renewal and show both retry choices without auto-paying", async () => {
  for (const width of [390, 1360]) {
    const page = await open({width});
    try {
      await ready(page);
      assert.equal(await page.$eval("#payment-heading", el => el.textContent), "Renewal payment failed");
      assert.match(await page.$eval("#billing-description", el => el.textContent), /insufficient funds/);
      assert.match(await page.$eval("#payment-amount", el => el.textContent), /25/);
      assert.match(await page.$eval("#default-card", el => el.textContent), /4242/);
      assert.equal(await page.$eval("#use-new-card-button", el => el.disabled), false);
      assert.equal(await page.evaluate(() => window.retries.length + window.confirmations.length + window.updates.length), 0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      if (width === 390) await page.screenshot({path: "/tmp/rhx-manage-subscription-mobile.png", fullPage: true});
    } finally {await page.close();}
  }
});

test("healthy subscription supports changing card for next charge without paying an invoice", async () => {
  const page = await open({healthy: true, query: "?subscriptionReference=sub_owner"});
  try {
    await ready(page);
    assert.equal(await page.$eval("#renewal-section", el => el.hidden), true);
    assert.equal(await page.$eval("#payment-heading", el => el.textContent), "Payments up to date");
    await page.click("#change-card-button"); await formReady(page);
    assert.match(await page.$eval("#card-submit-button", el => el.textContent), /Save card for future/);
    assert.match(await page.evaluate(() => window.mounts[0].clientSecret), /^seti_/);
    await page.click("#card-submit-button");
    await page.waitForFunction(() => document.querySelector("#default-card").textContent.includes("4444"));
    assert.equal(await page.evaluate(() => window.retries.length + window.confirmations.length), 0);
    assert.equal(await page.evaluate(() => window.setupConfirmations.length), 1);
    assert.deepEqual(await page.evaluate(() => window.updates[0]), {subscriptionReference: "sub_owner", setupIntentReference: "seti_new"});
  } finally {await page.close();}
});

test("payment admin loads and saves retry settings through the payment feature", async () => {
  const page = await open({route: paymentAdminPath, query: "", width: 390,
    paymentConfig: {provider: "stripe", mode: "prod", customData: {keep: "value"},
      renewalRetryPolicy: {maxRetries: 2, intervalHours: 12}}});
  try {
    await page.waitForFunction(() => document.querySelector("#renewal-max-retries").value === "2");
    assert.equal(await page.$eval("#renewal-retry-interval", el => el.value), "12");
    await page.$eval("#renewal-max-retries", el => {el.value = "11"; el.dispatchEvent(new Event("input", {bubbles: true}));});
    assert.equal(await page.$eval("#save-payment-config", el => el.disabled), true);
    await page.$eval("#renewal-max-retries", el => {el.value = "4"; el.dispatchEvent(new Event("input", {bubbles: true}));});
    await page.$eval("#renewal-retry-interval", el => {el.value = "6"; el.dispatchEvent(new Event("input", {bubbles: true}));});
    await page.click("#save-payment-config");
    await page.waitForFunction(() => window.configSaves.length === 1);
    assert.deepEqual(await page.evaluate(() => window.configSaves[0]), {provider: "stripe", mode: "prod",
      renewalRetryPolicy: {maxRetries: 4, intervalHours: 6, gracePeriodHours: 72}, customData: {keep: "value"}});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  } finally {await page.close();}
});

const retryDetails = {state: "scheduled", maxRetries: 3, intervalHours: 24, attemptsMade: 1,
  firstFailedAt: "2026-11-01T00:00:00Z", graceUntil: "2026-11-04T00:00:00Z",
  nextAttemptAt: "2026-11-03T00:00:00Z", lastAttemptAt: "2026-11-02T00:00:00Z"};

test("failed renewal remains Active and displays its backend retry policy and progress", async () => {
  const page = await open({details: {subscriptionReference: "sub_owner", subscriptionStatus: "past_due",
    applicationStatus: "active", renewalRetry: retryDetails, paymentState: "failed", linkedInvoiceIsCurrent: true,
    renewal: {action: "retry_payment", invoiceReference: "in_due", amountDue: 2500, currency: "myr",
      canRetry: true, nextPaymentAttemptAt: retryDetails.nextAttemptAt}}});
  try {
    assert.equal(await page.$eval("#subscription-state", el => el.textContent), "Active");
    assert.equal(await page.$eval("#payment-heading", el => el.textContent), "Renewal payment failed");
    assert.match(await page.$eval("#billing-description", el => el.textContent), /remains active during the retry period/);
    assert.equal(await page.$eval("#automatic-retry-count", el => el.textContent), "1 of 3");
    assert.equal(await page.$eval("#automatic-retry-interval", el => el.textContent), "24 hours");
    assert.equal(await page.$eval("#renewal-retry-summary", el => el.hidden), false);
    assert.equal(await page.$eval("#retry-payment-button", el => el.disabled), false);
  } finally {await page.close();}
});

test("Suspended application status still allows guardian payment recovery without blocking student access", async () => {
  const page = await open({width: 390});
  try {
    await ready(page);
    await page.evaluate(retry => {
      Object.assign(window.fixture.details, {applicationStatus: "suspended",
        renewalRetry: {...retry, state: "exhausted", attemptsMade: 3, nextAttemptAt: null}});
    }, retryDetails);
    await page.click("#refresh-payment-button"); await ready(page);
    assert.equal(await page.$eval("#subscription-state", el => el.textContent), "Suspended");
    assert.equal(await page.$eval("#payment-heading", el => el.textContent), "Subscription suspended");
    assert.match(await page.$eval("#billing-description", el => el.textContent), /Student access is suspended after the grace period ends/);
    assert.equal(await page.$eval("#retry-payment-button", el => el.disabled), false);
    assert.equal(await page.$eval("#change-card-button", el => el.disabled), false);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.evaluate(() => {window.fixture.details.renewalRetry.state = "scheduled";});
    await page.click("#refresh-payment-button"); await ready(page);
    assert.match(await page.$eval("#retry-state-description", el => el.textContent), /remains Suspended until payment/);
  } finally {await page.close();}
});

test("paid provider status does not falsely claim suspension has already cleared before the webhook", async () => {
  const page = await open({healthy: true, details: {subscriptionReference: "sub_owner", subscriptionStatus: "active",
    applicationStatus: "suspended", paymentState: "paid", renewal: null, canChangeCard: true,
    linkedInvoiceIsCurrent: true, renewalRetry: {...retryDetails, state: "exhausted", attemptsMade: 3}}});
  try {
    await ready(page);
    assert.equal(await page.$eval("#subscription-state", el => el.textContent), "Suspended");
    assert.match(await page.$eval("#billing-description", el => el.textContent), /subscription status is updating/);
    assert.match(await page.$eval("#retry-state-description", el => el.textContent), /payment is confirmed/);
    assert.doesNotMatch(await page.$eval("#retry-state-description", el => el.textContent), /Complete the outstanding/);
  } finally {await page.close();}
});

test("missing or inaccessible subscriptions show an unavailable link without claiming a failed payment", async () => {
  for (const loadError of ["functions/not-found", "functions/permission-denied"]) {
    const page = await open({loadError, width: 390});
    try {
      assert.equal(await page.$eval("#payment-heading", el => el.textContent), "Subscription unavailable");
      assert.match(await page.$eval("#billing-description", el => el.textContent), /old or deleted subscription/);
      assert.match(await page.$eval("#payment-error", el => el.textContent), /Guardian Dashboard.*new checkout/);
      assert.match(await page.$eval("#payment-error", el => el.textContent), /Support code:/);
      assert.doesNotMatch(await page.$eval("#payment-card", el => el.textContent), /private backend details|payment result is unknown/i);
      assert.equal(await page.$eval("#saved-card-section", el => el.hidden), true);
      assert.equal(await page.$eval("#retry-payment-button", el => el.disabled), true);
      assert.equal(await page.$eval("#refresh-payment-button", el => el.disabled), false);
      assert.equal(await page.evaluate(() => window.retries.length + window.confirmations.length + window.updates.length), 0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    } finally {await page.close();}
  }
});

test("lookup connection errors remain retryable and a successful refresh restores management", async () => {
  for (const loadError of ["functions/unavailable", "functions/deadline-exceeded"]) {
    const page = await open({loadError});
    try {
      assert.equal(await page.$eval("#payment-heading", el => el.textContent), "Payment service unavailable");
      assert.match(await page.$eval("#payment-error", el => el.textContent), /before attempting another payment/);
      await page.evaluate(() => {window.fixture.loadError = null;});
      await page.click("#refresh-payment-button"); await ready(page);
      assert.equal(await page.$eval("#payment-heading", el => el.textContent), "Renewal payment failed");
      assert.equal(await page.$eval("#payment-error", el => el.hidden), true);
      assert.equal(await page.evaluate(() => window.retries.length + window.confirmations.length), 0);
    } finally {await page.close();}
  }
});

test("expired sign-in shows its recovery panel and generic server errors remain distinct", async () => {
  const signedOut = await open({loadError: "functions/unauthenticated"});
  try {
    assert.equal(await signedOut.$eval("#payment-heading", el => el.textContent), "Sign in to continue");
    assert.equal(await signedOut.$eval("#sign-in-panel", el => el.hidden), false);
  } finally {await signedOut.close();}
  const serverError = await open({loadError: "functions/internal"});
  try {
    assert.equal(await serverError.$eval("#payment-heading", el => el.textContent), "Could not check payment status");
    assert.equal(await serverError.$eval("#payment-status", el => el.hidden), true);
    assert.match(await serverError.$eval("#payment-error", el => el.textContent), /Support code: internal/);
    assert.doesNotMatch(await serverError.$eval("#payment-card", el => el.textContent), /private backend details|new checkout/);
  } finally {await serverError.close();}
});

test("failed refresh hides previously displayed billing details and disables payment actions", async () => {
  const page = await open();
  try {
    await ready(page);
    await page.evaluate(() => {window.fixture.loadError = "functions/not-found";});
    await page.click("#refresh-payment-button");
    await page.waitForFunction(() => document.querySelector("#payment-heading").textContent === "Subscription unavailable");
    assert.equal(await page.$eval("#payment-summary", el => el.hidden), true);
    assert.equal(await page.$eval("#saved-card-section", el => el.hidden), true);
    assert.equal(await page.$eval("#renewal-section", el => el.hidden), true);
    assert.equal(await page.$eval("#default-card", el => el.textContent), "");
    for (const id of ["#retry-payment-button", "#use-new-card-button", "#change-card-button"]) {
      assert.equal(await page.$eval(id, el => el.disabled), true);
    }
    assert.equal(await page.evaluate(() => window.retries.length + window.confirmations.length + window.updates.length), 0);
  } finally {await page.close();}
});

test("saving a card while renewal is failed leaves that invoice unpaid and visible", async () => {
  const page = await open();
  try {
    await ready(page); await page.click("#change-card-button"); await formReady(page);
    await page.click("#card-submit-button");
    await page.waitForFunction(() => document.querySelector("#default-card").textContent.includes("4444"));
    assert.equal(await page.$eval("#payment-heading", el => el.textContent), "Renewal payment failed");
    assert.equal(await page.evaluate(() => window.retries.length + window.confirmations.length), 0);
    assert.match(await page.$eval("#payment-amount", el => el.textContent), /25/);
  } finally {await page.close();}
});

test("pay with new card uses existing invoice context and rechecks backend before success", async () => {
  const page = await open();
  try {
    await ready(page); await page.click("#use-new-card-button"); await formReady(page);
    assert.deepEqual(await page.evaluate(() => window.actionLoads[0]), {subscriptionReference: "sub_owner", invoiceReference: "in_due", paymentMethodChoice: "new_card"});
    assert.match(await page.evaluate(() => window.mounts[0].clientSecret), /^pi_/);
    assert.match(await page.$eval("#card-submit-button", el => el.textContent), /25.*save card/);
    await page.click("#card-submit-button");
    await page.waitForFunction(() => document.querySelector("#payment-heading").textContent === "Payment complete");
    assert.equal(await page.evaluate(() => window.setups.length + window.setupConfirmations.length + window.retries.length), 0);
    const confirmation = await page.evaluate(() => window.confirmations[0]);
    assert.equal(confirmation.contextReference, "stripe_setup_context_payment");
    assert.match(confirmation.returnUrl, /invoiceReference=in_due/);
    assert.equal(await page.evaluate(() => window.loads.length), 2);
    assert.equal(await page.evaluate(() => document.body.textContent.includes("pi_due_secret")), false);
  } finally {await page.close();}
});

test("saved-card retry disables duplicate clicks and settles the shown invoice", async () => {
  const page = await open({deferRetry: true});
  try {
    await ready(page); await page.click("#retry-payment-button");
    await page.waitForFunction(() => window.retries.length === 1);
    await page.$eval("#retry-payment-button", el => el.click());
    assert.equal(await page.evaluate(() => window.retries.length), 1);
    await page.evaluate(() => window.releaseRetry());
    await page.waitForFunction(() => document.querySelector("#payment-heading").textContent === "Payment complete");
    const input = await page.evaluate(() => window.retries[0]);
    assert.equal(input.invoiceReference, "in_due"); assert.match(input.idempotencyReference, /^[a-f0-9-]{36}$/);
  } finally {await page.close();}
});

test("lost saved-card response requires status check and retains attempt after reload", async () => {
  const page = await open({retryError: true});
  try {
    await ready(page); await page.click("#retry-payment-button");
    await page.waitForFunction(() => !document.querySelector("#payment-error").hidden);
    const first = await page.evaluate(() => window.retries[0].idempotencyReference);
    assert.equal(await page.$eval("#retry-payment-button", el => el.disabled), true);
    await page.reload({waitUntil: "networkidle0"}); await ready(page);
    await page.click("#retry-payment-button");
    await page.waitForFunction(() => window.retries.length === 1);
    assert.equal(await page.evaluate(() => window.retries[0].idempotencyReference), first);
  } finally {await page.close();}
});

test("saved-card 3DS reuses authentication feature without another pay request", async () => {
  const page = await open({behavior: "3ds"});
  try {
    await ready(page); await page.click("#retry-payment-button");
    await page.waitForSelector("#confirm-payment-button:not([hidden])");
    assert.equal(await page.$eval("#payment-heading", el => el.textContent), "Bank authentication required");
    await page.click("#confirm-payment-button");
    await page.waitForFunction(() => document.querySelector("#payment-heading").textContent === "Payment complete");
    assert.equal(await page.evaluate(() => window.retries.length), 1);
    assert.equal(await page.evaluate(() => window.confirmations[0].authenticationOnly), true);
  } finally {await page.close();}
});

test("new-card decline refreshes real status without showing success", async () => {
  const page = await open({payError: true});
  try {
    await ready(page); await page.click("#use-new-card-button"); await formReady(page);
    await page.click("#card-submit-button");
    await page.waitForFunction(() => !document.querySelector("#payment-error").hidden);
    assert.equal(await page.$eval("#payment-heading", el => el.textContent), "Renewal payment failed");
    assert.equal(await page.$eval("#card-form-section", el => el.hidden), true);
    assert.equal(await page.evaluate(() => window.loads.length), 2);
  } finally {await page.close();}
});

test("cancelled card entry disposes context without setup confirmation, update, or payment", async () => {
  const page = await open();
  try {
    await ready(page); await page.click("#change-card-button"); await formReady(page);
    await page.click("#card-cancel-button");
    assert.equal(await page.evaluate(() => window.disposed.length), 1);
    assert.equal(await page.evaluate(() => window.updates.length + window.setupConfirmations.length + window.confirmations.length + window.retries.length), 0);
  } finally {await page.close();}
});

test("card setup redirect safely resumes the authorized save and removes URL secrets", async () => {
  const page = await open({healthy: true, pendingSetup: {setupIntentReference: "seti_new", stage: "confirming"},
    query: "?subscriptionReference=sub_owner&setup_intent=seti_new&setup_intent_client_secret=seti_new_secret_private&redirect_status=succeeded"});
  try {
    await page.waitForFunction(() => window.updates.length === 1);
    await ready(page);
    assert.doesNotMatch(page.url(), /secret|redirect_status|setup_intent=/);
    assert.equal(await page.evaluate(() => window.retries.length + window.confirmations.length), 0);
    assert.match(await page.$eval("#default-card", el => el.textContent), /4444/);
  } finally {await page.close();}
});

test("an unsolicited SetupIntent return cannot change the card", async () => {
  const page = await open({healthy: true, query: "?subscriptionReference=sub_owner&setup_intent=seti_forged&redirect_status=succeeded"});
  try {await ready(page); assert.equal(await page.evaluate(() => window.updates.length), 0);}
  finally {await page.close();}
});

test("signed-out page loads no billing data; sign-in retains subscription parameters", async () => {
  const page = await open({signedOut: true});
  try {
    assert.equal(await page.$eval("#sign-in-panel", el => el.hidden), false);
    assert.equal(await page.evaluate(() => window.loads.length), 0);
    await page.evaluate(() => window.setAuth({uid: "owner"})); await ready(page);
    assert.match(page.url(), /subscriptionReference=sub_owner/);
    assert.equal(await page.evaluate(() => window.retries.length), 0);
  } finally {await page.close();}
});

test("sign-out during a save prevents applying card setup to the next account", async () => {
  const page = await open({healthy: true, deferSetup: true});
  try {
    await ready(page); await page.click("#change-card-button"); await formReady(page);
    await page.click("#card-submit-button");
    await page.waitForFunction(() => !!window.releaseSetup);
    await page.evaluate(() => {window.setAuth(null); window.releaseSetup();});
    await page.waitForFunction(() => document.querySelector("#payment-heading").textContent === "Sign in to continue");
    assert.equal(await page.evaluate(() => window.updates.length), 0);
    assert.equal(await page.$eval("#saved-card-section", el => el.hidden), true);
  } finally {await page.close();}
});

test("outdated invoice links require explicit review of the latest renewal", async () => {
  const page = await open();
  try {
    await ready(page);
    await page.evaluate(() => {window.fixture.details.linkedInvoiceIsCurrent = false;});
    await page.click("#refresh-payment-button"); await ready(page);
    assert.equal(await page.$eval("#old-invoice-notice", el => el.hidden), false);
    assert.equal(await page.$eval("#retry-payment-button", el => el.disabled), true);
    assert.equal(await page.$eval("#use-new-card-button", el => el.disabled), true);
    assert.doesNotMatch(await page.$eval("#view-current-invoice", el => el.href), /invoiceReference=/);
  } finally {await page.close();}
});

test("original guardian retry URL reaches management while first-payment page keeps its separate role", async () => {
  const alias = await open({route: oldRetryPath});
  try {await ready(alias); assert.match(await alias.$eval("#page-heading", el => el.textContent), /Manage subscription/);}
  finally {await alias.close();}
  const page = await open({route: completePagePath, query: "?subscriptionReference=sub_owner", details: {
    renewal: {action: "confirm_payment", subscriptionReference: "sub_owner", invoiceReference: "in_due",
      amountDue: 2500, currency: "myr", paymentClientSecret: "pi_first_secret_private"}}});
  try {
    await page.waitForSelector("#confirm-payment-button:not([hidden])");
    assert.equal(await page.$("#change-card-button"), null);
    await page.click("#confirm-payment-button");
    await page.waitForFunction(() => document.querySelector("#payment-heading").textContent === "Payment complete");
    assert.equal(await page.evaluate(() => window.retries.length), 0);
  } finally {await page.close();}
});

function firstPaymentDetails(paymentStatus = "requires_confirmation") {
  return {renewal: {action: "confirm_payment", subscriptionReference: "sub_owner", invoiceReference: "in_first",
    amountDue: 16000, currency: "myr", paymentClientSecret: "pi_first_secret_private", paymentStatus}};
}

test("first payment shows amount and confirms saved card only after an explicit click on desktop and mobile", async () => {
  for (const width of [390, 1360]) {
    const page = await open({width, route: completePagePath, details: firstPaymentDetails()});
    try {
      await page.waitForSelector("#confirm-payment-button:not([hidden])");
      assert.equal(await page.$eval("#payment-heading", el => el.textContent), "Payment confirmation required");
      assert.match(await page.$eval("#confirm-payment-button", el => el.textContent), /Pay.*160\.00/);
      assert.equal(await page.evaluate(() => window.confirmations.length), 0);
      await page.click("#refresh-payment-button");
      await page.waitForFunction(() => window.actionLoads.length === 2 && !document.querySelector("#refresh-payment-button").disabled);
      assert.equal(await page.evaluate(() => window.confirmations.length), 0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      if (width === 390) await page.screenshot({path: "/tmp/rhx-initial-confirmation/payment-mobile.png", fullPage: true});
      await page.click("#confirm-payment-button");
      await page.waitForFunction(() => document.querySelector("#payment-heading").textContent === "Payment complete");
      const input = await page.evaluate(() => window.confirmations[0]);
      assert.equal(input.useSavedCard, true);
      assert.equal(input.authenticationOnly, undefined);
      assert.equal(await page.evaluate(() => window.retries.length), 0);
    } finally {await page.close();}
  }
});

test("bank authentication uses next-action mode without another payment submission", async () => {
  const page = await open({route: completePagePath, details: firstPaymentDetails("requires_action")});
  try {
    await page.waitForSelector("#confirm-payment-button:not([hidden])");
    assert.equal(await page.$eval("#confirm-payment-button", el => el.textContent), "Authenticate Payment");
    await page.click("#confirm-payment-button");
    await page.waitForFunction(() => document.querySelector("#payment-heading").textContent === "Payment complete");
    assert.equal(await page.evaluate(() => window.confirmations[0].authenticationOnly), true);
    assert.equal(await page.evaluate(() => window.confirmations[0].useSavedCard), undefined);
  } finally {await page.close();}
});

test("first-payment button blocks duplicates and reconciles a lost successful response", async () => {
  const page = await open({route: completePagePath, details: firstPaymentDetails(), deferConfirmation: true, confirmationLost: true});
  try {
    await page.waitForSelector("#confirm-payment-button:not([hidden])");
    await page.click("#confirm-payment-button");
    await page.waitForFunction(() => !!window.releaseConfirmation);
    assert.equal(await page.$eval("#confirm-payment-button", el => el.disabled), true);
    await page.evaluate(() => {document.querySelector("#confirm-payment-button").click(); window.releaseConfirmation();});
    await page.waitForFunction(() => document.querySelector("#payment-heading").textContent === "Payment complete");
    assert.equal(await page.evaluate(() => window.confirmations.length), 1);
    assert.equal(await page.$eval("#payment-status", el => el.classList.contains("is-success")), true);
  } finally {await page.close();}
});

test("unknown payment result hides Pay until the backend can verify the invoice", async () => {
  const page = await open({route: completePagePath, details: firstPaymentDetails(), readFailsAfterConfirmation: true});
  try {
    await page.waitForSelector("#confirm-payment-button:not([hidden])");
    await page.click("#confirm-payment-button");
    await page.waitForFunction(() => document.querySelector("#payment-heading").textContent === "Could not load payment");
    assert.equal(await page.$eval("#confirm-payment-button", el => el.hidden), true);
    assert.equal(await page.evaluate(() => window.confirmations.length), 1);
    await page.evaluate(() => {window.fixture.actionError = false; window.fixture.details.renewal.action = "wait";});
    await page.click("#refresh-payment-button");
    await page.waitForFunction(() => document.querySelector("#payment-heading").textContent === "Payment processing");
    assert.equal(await page.evaluate(() => window.confirmations.length), 1);
  } finally {await page.close();}
});

test("stale first-payment lookup cannot expose a Pay button after sign-out", async () => {
  const page = await open({route: completePagePath, details: firstPaymentDetails(), deferAction: true});
  try {
    await page.waitForFunction(() => window.pendingActions.length === 1);
    await page.evaluate(() => {window.setAuth(null); window.pendingActions[0](window.fixture.details.renewal);});
    await page.waitForFunction(() => document.querySelector("#payment-heading").textContent === "Sign in to continue");
    assert.equal(await page.$eval("#confirm-payment-button", el => el.hidden), true);
    assert.equal(await page.$eval("#payment-summary", el => el.hidden), true);
    assert.equal(await page.evaluate(() => window.confirmations.length), 0);
  } finally {await page.close();}
});

test("account switch clears old payment and ignores its late confirmation", async () => {
  const page = await open({route: completePagePath, details: firstPaymentDetails(), deferConfirmation: true});
  try {
    await page.waitForSelector("#confirm-payment-button:not([hidden])");
    await page.click("#confirm-payment-button");
    await page.waitForFunction(() => !!window.releaseConfirmation);
    await page.evaluate(() => {window.fixture.deferAction = true; window.setAuth({uid: "other"});});
    await page.waitForFunction(() => window.pendingActions.length === 1);
    assert.equal(await page.$eval("#payment-summary", el => el.hidden), true);
    await page.evaluate(() => {window.releaseConfirmation();});
    await page.waitForFunction(() => window.fixture.details.renewal.action === "complete");
    assert.equal(await page.$eval("#payment-card", el => el.getAttribute("aria-busy")), "true");
    await page.evaluate(() => window.pendingActions[0]({...window.fixture.details.renewal, action: "unavailable", paymentClientSecret: null}));
    await page.waitForFunction(() => document.querySelector("#payment-heading").textContent === "Payment unavailable");
    assert.equal(await page.evaluate(() => window.confirmations.length), 1);
  } finally {await page.close();}
});

test("guardian explicitly confirms cancellation for only the selected student on desktop and mobile", async () => {
  for (const width of [390, 1360]) {
    const page = await open({width, healthy: true, cancellable: true, family: true, checkoutSavedCard: true});
    try {
      await ready(page);
      assert.equal(await page.evaluate(() => window.subscriptionCancellations.length), 0);
      await page.click("#cancel-subscription-button");
      assert.match(await page.$eval("#subscription-cancellation-confirmation-text", el => el.textContent), /Alice.*subscription now/);
      await page.click("#keep-subscription-button");
      assert.equal(await page.evaluate(() => window.subscriptionCancellations.length), 0);
      await page.click("#cancel-subscription-button");
      await page.click("#confirm-subscription-cancellation");
      await page.waitForFunction(() => document.querySelector("#payment-heading").textContent === "Subscription cancelled"
        && !document.querySelector("#create-subscription-section").hidden);
      assert.deepEqual(await page.evaluate(() => window.subscriptionCancellations), [{subscriptionReference: "sub_owner"}]);
      assert.match(await page.$eval("#selected-plan-price", el => el.textContent), /No payment is taken now.*First charge/);
      assert.match(await page.$eval("#checkout-payment-note", el => el.textContent), /No subscription payment is taken now/);
      assert.equal(await page.evaluate(() => window.studentCreates.length + window.retries.length + window.confirmations.length), 0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      if (width === 390) await page.screenshot({path: "/tmp/rhx-cancellation/cancelled-mobile.png", fullPage: true});
      await page.select("#linked-student-select", "student-b");
      await ready(page);
      assert.equal(await page.$eval("#subscription-reference", el => el.textContent), "sub_second");
    } finally {await page.close();}
  }
});

test("cancellation pending explains an in-progress payment and cannot create another subscription", async () => {
  const page = await open({healthy: true, cancellable: true, cancellationPending: true});
  try {
    await ready(page); await page.click("#cancel-subscription-button"); await page.click("#confirm-subscription-cancellation");
    await page.waitForFunction(() => document.querySelector("#payment-heading").textContent === "Cancellation pending");
    assert.match(await page.$eval("#billing-description", el => el.textContent), /already in progress/);
    assert.equal(await page.$eval("#create-subscription-section", el => el.hidden), true);
    assert.equal(await page.$eval("#cancel-subscription-button", el => el.hidden), true);
    assert.equal(await page.evaluate(() => window.studentCreates.length), 0);
  } finally {await page.close();}
});

test("duplicate cancellation clicks make one request and a lost result requires a fresh status check", async () => {
  const page = await open({healthy: true, cancellable: true, deferCancellation: true, cancellationError: true});
  try {
    await ready(page); await page.click("#cancel-subscription-button"); await page.click("#confirm-subscription-cancellation");
    await page.waitForFunction(() => !!window.releaseCancellation);
    assert.equal(await page.$eval("#confirm-subscription-cancellation", el => el.disabled), true);
    await page.evaluate(() => {document.querySelector("#confirm-subscription-cancellation").click(); window.releaseCancellation();});
    await page.waitForFunction(() => !document.querySelector("#payment-error").hidden);
    assert.equal(await page.evaluate(() => window.subscriptionCancellations.length), 1);
    assert.match(await page.$eval("#payment-status", el => el.textContent), /Cancellation is not confirmed/);
    assert.equal(await page.$eval("#create-subscription-section", el => el.hidden), true);
  } finally {await page.close();}
});

test("sign-out during cancellation discards the old guardian's result", async () => {
  const page = await open({healthy: true, cancellable: true, deferCancellation: true});
  try {
    await ready(page); await page.click("#cancel-subscription-button"); await page.click("#confirm-subscription-cancellation");
    await page.waitForFunction(() => !!window.releaseCancellation);
    await page.evaluate(() => {window.setAuth(null); window.releaseCancellation();});
    await page.waitForFunction(() => document.querySelector("#payment-heading").textContent === "Sign in to continue");
    assert.equal(await page.$eval("#subscription-cancellation-section", el => el.hidden), true);
    assert.equal(await page.$eval("#payment-summary", el => el.hidden), true);
    assert.equal(await page.$eval("#create-subscription-section", el => el.hidden), true);
  } finally {await page.close();}
});

test("invalid links cannot load details or submit payments", async () => {
  for (const query of ["?studentId=", "?studentId=bad%2Fpath", "?subscriptionReference=sub_bad%2Fpath", "?subscriptionReference=sub_owner&invoiceReference=bad"]) {
    const page = await open({query});
    try {
      assert.equal(await page.$eval("#payment-heading", el => el.textContent), "Invalid payment link");
      assert.equal(await page.evaluate(() => window.loads.length + window.retries.length + window.updates.length), 0);
    } finally {await page.close();}
  }
});

test("updating the future card retains an outdated invoice guard", async () => {
  const page = await open({query: "?subscriptionReference=sub_owner&invoiceReference=in_old"});
  try {
    await ready(page);
    await page.evaluate(() => {window.fixture.details.linkedInvoiceIsCurrent = false;});
    await page.click("#refresh-payment-button"); await ready(page);
    await page.click("#change-card-button"); await formReady(page);
    await page.click("#card-submit-button");
    await page.waitForFunction(() => document.querySelector("#default-card").textContent.includes("4444"));
    assert.equal(await page.evaluate(() => window.updates[0].invoiceReference), "in_old");
    assert.equal(await page.$eval("#retry-payment-button", el => el.disabled), true);
    assert.equal(await page.$eval("#use-new-card-button", el => el.disabled), true);
  } finally {await page.close();}
});

test("a lost future-card update can be finished without collecting or confirming the card again", async () => {
  const page = await open({healthy: true, updateError: true});
  try {
    await ready(page); await page.click("#change-card-button"); await formReady(page);
    await page.click("#card-submit-button");
    await page.waitForFunction(() => !document.querySelector("#finish-save-button").hidden);
    await page.evaluate(() => {window.fixture.updateError = false;});
    await page.click("#finish-save-button");
    await page.waitForFunction(() => document.querySelector("#default-card").textContent.includes("4444"));
    assert.equal(await page.evaluate(() => window.setupConfirmations.length), 1);
    assert.equal(await page.evaluate(() => window.setups.length), 1);
    assert.equal(await page.evaluate(() => window.updates.length), 2);
    assert.equal(await page.evaluate(() => window.retries.length + window.confirmations.length), 0);
  } finally {await page.close();}
});

test("guardian dashboard opens student payment management whether a subscription exists or not", async () => {
  const page = await open({route: "/features/guardian/pages/landing/landing.html", query: ""});
  try {
    const selector = '.subscription-management-link[href*="manage_subscription_payment.html"]';
    await page.waitForSelector(selector);
    assert.match(await page.$eval(selector, el => el.href), /studentId=student-a/);
    await page.click(selector);
    await page.waitForSelector("#change-card-button"); await ready(page);
    assert.equal(await page.$eval("#payment-heading", el => el.textContent), "Renewal payment failed");
  } finally {await page.close();}
});

test("changing the future card after an uncertain retry starts a fresh explicit payment attempt", async () => {
  const page = await open({retryError: true});
  try {
    await ready(page); await page.click("#retry-payment-button");
    await page.waitForFunction(() => !document.querySelector("#payment-error").hidden);
    const first = await page.evaluate(() => window.retries[0].idempotencyReference);
    await page.click("#change-card-button"); await formReady(page);
    await page.click("#card-submit-button");
    await page.waitForFunction(() => document.querySelector("#default-card").textContent.includes("4444"));
    assert.equal(await page.$eval("#retry-payment-button", el => el.disabled), true);
    await page.evaluate(() => {window.fixture.retryError = false; window.fixture.behavior = "decline";});
    await page.click("#refresh-payment-button"); await ready(page);
    await page.click("#retry-payment-button");
    await page.waitForFunction(() => window.retries.length === 2);
    assert.notEqual(await page.evaluate(() => window.retries[1].idempotencyReference), first);
  } finally {await page.close();}
});

test("an initial subscription failure is not labeled as a failed renewal", async () => {
  const page = await open({details: {subscriptionReference: "sub_owner", subscriptionStatus: "incomplete",
    paymentState: "failed", renewal: null, canChangeCard: false, linkedInvoiceIsCurrent: true}});
  try {
    assert.equal(await page.$eval("#payment-heading", el => el.textContent), "Initial payment incomplete");
    assert.equal(await page.$eval("#subscription-state", el => el.textContent), "Initial payment incomplete");
    assert.equal(await page.$eval("#renewal-section", el => el.hidden), true);
    assert.equal(await page.$eval("#initial-payment-notice", el => el.hidden), false);
    assert.match(await page.$eval("#complete-initial-payment", el => el.href), /complete_subscription_payment/);
    assert.equal(await page.evaluate(() => window.retries.length + window.confirmations.length), 0);
  } finally {await page.close();}
});


test("family card selection lists student plans on desktop and mobile and updates only explicitly selected scope", async () => {
  for (const width of [390, 1360]) {
    const page = await open({healthy: true, family: true, width, query: "?subscriptionReference=sub_owner"});
    try {
      await ready(page);
      assert.equal(await page.$eval("#student-name", el => el.textContent), "Alice");
      assert.equal(await page.$eval("#card-scope-subscription", el => el.checked), true);
      await page.click("#card-scope-all");
      assert.match(await page.$eval("#card-scope-targets", el => el.textContent), /Alice.*monthly.*Ben.*yearly/);
      await page.click("#change-card-button"); await formReady(page);
      assert.equal(await page.$eval("#card-scope-subscription", el => el.disabled), true);
      assert.equal(await page.evaluate(() => window.setups[0].cardChangeScope), "all_students");
      assert.match(await page.$eval("#card-submit-button", el => el.textContent), /all listed students/);
      await page.click("#card-submit-button");
      await page.waitForFunction(() => !document.querySelector("#card-update-summary").hidden);
      assert.deepEqual(await page.evaluate(() => window.updates[0]), {subscriptionReference: "sub_owner",
        setupIntentReference: "seti_new", cardChangeScope: "all_students"});
      assert.match(await page.$eval("#card-update-results", el => el.textContent), /Alice: Card updated.*Ben: Card updated/);
      assert.equal(await page.evaluate(() => window.retries.length + window.confirmations.length), 0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      if (width === 390) await page.screenshot({path: "/tmp/rhx-student-card-scope/family-mobile.png", fullPage: true});
    } finally {await page.close();}
  }
});

test("family partial save keeps the scope and setup when finishing the remaining card updates", async () => {
  const page = await open({healthy: true, family: true, partialUpdate: true, query: "?subscriptionReference=sub_owner"});
  try {
    await ready(page); await page.click("#card-scope-all"); await page.click("#change-card-button"); await formReady(page);
    await page.click("#card-submit-button");
    await page.waitForFunction(() => !document.querySelector("#finish-save-button").hidden);
    assert.match(await page.$eval("#card-update-results", el => el.textContent), /Ben: Update not confirmed/);
    await page.evaluate(() => {window.fixture.partialUpdate = false;});
    await page.click("#finish-save-button");
    await page.waitForFunction(() => document.querySelector("#finish-save-button").hidden);
    assert.equal(await page.evaluate(() => window.setups.length), 1);
    assert.equal(await page.evaluate(() => window.updates.length), 2);
    assert.equal(await page.evaluate(() => window.updates.every(u => u.cardChangeScope === "all_students" && u.setupIntentReference === "seti_new")), true);
    assert.equal(await page.evaluate(() => window.retries.length + window.confirmations.length), 0);
  } finally {await page.close();}
});

test("bank return restores the consented family scope rather than the default single-student choice", async () => {
  const page = await open({healthy: true, family: true,
    pendingSetup: {setupIntentReference: "seti_new", stage: "confirming", cardChangeScope: "all_students"},
    query: "?subscriptionReference=sub_owner&setup_intent=seti_new&setup_intent_client_secret=private"});
  try {
    await page.waitForFunction(() => window.updates.length === 1);
    assert.equal(await page.evaluate(() => window.updates[0].cardChangeScope), "all_students");
    assert.equal(await page.$eval("#card-scope-all", el => el.checked), true);
    assert.equal(await page.evaluate(() => location.search.includes("private")), false);
    assert.equal(await page.evaluate(() => window.retries.length + window.confirmations.length), 0);
  } finally {await page.close();}
});

test("future-card family choice does not expand an invoice payment and signing out clears student details", async () => {
  const page = await open({family: true});
  try {
    await ready(page); await page.click("#card-scope-all"); await page.click("#use-new-card-button"); await formReady(page);
    assert.match(await page.$eval("#card-form-description", el => el.textContent), /this subscription/);
    assert.equal(await page.evaluate(() => window.setups.length), 0);
    await page.click("#card-cancel-button");
    await page.evaluate(() => window.setAuth(null));
    assert.equal(await page.$eval("#student-name", el => el.textContent), "");
    assert.equal(await page.$eval("#card-scope-targets", el => el.textContent), "");
    assert.doesNotMatch(await page.$eval("#this-student-label", el => el.textContent), /Alice/);
  } finally {await page.close();}
});


test("family card entry shows the server-confirmed selection when student subscriptions changed since page load", async () => {
  const page = await open({healthy: true, family: true,
    setupTargets: [{subscriptionReference: "sub_owner", studentId: "student-a", studentName: "Alice", planId: "monthly"},
      {subscriptionReference: "sub_third", studentId: "student-c", studentName: "Cara <script>", planId: "monthly"}]});
  try {
    await ready(page); await page.click("#card-scope-all"); await page.click("#change-card-button"); await formReady(page);
    assert.match(await page.$eval("#card-scope-targets", el => el.textContent), /Cara <script>/);
    assert.doesNotMatch(await page.$eval("#card-scope-targets", el => el.textContent), /Ben/);
    assert.equal(await page.$$eval("#card-scope-targets script", nodes => nodes.length), 0);
    assert.equal(await page.evaluate(() => window.updates.length), 0);
  } finally {await page.close();}
});


test("guardian sees the new paid period and waits for billing recovery before access is confirmed", async () => {
  const page = await open();
  try {
    await ready(page);
    await page.evaluate(() => {
      window.fixture.details.renewalRecovery = {version: 1, state: "pending_reset", graceUntil: "2026-11-04T00:00:00Z",
        paidAt: "2026-11-12T00:00:00Z", paidThrough: "2026-12-12T00:00:00Z"};
      window.fixture.details.applicationStatus = "suspended";window.fixture.details.paymentState = "paid";
      window.fixture.details.renewal = {...window.fixture.details.renewal, action: "complete", canRetry: false, canPayWithNewCard: false};
    });
    await page.click("#refresh-payment-button"); await ready(page);
    assert.equal(await page.$eval("#payment-heading", e => e.textContent), "Payment received");
    assert.match(await page.$eval("#billing-description", e => e.textContent), /Do not pay again/);
    assert.equal(await page.$eval("#renewal-recovery-summary", e => e.hidden), false);
    assert.match(await page.$eval("#recovered-period", e => e.textContent), /Nov.*12.*Dec.*12/);
    await page.evaluate(() => {window.fixture.details.renewalRecovery.state = "completed"; window.fixture.details.applicationStatus = "active";});
    await page.click("#refresh-payment-button"); await ready(page);
    assert.equal(await page.$eval("#subscription-state", e => e.textContent), "Active");
    assert.match(await page.$eval("#billing-description", e => e.textContent), /new paid period/);
    assert.equal(await page.evaluate(() => window.retries.length + window.confirmations.length), 0);
  } finally {await page.close();}
});

test("student suspension page keeps the account signed in and returns to learning after guardian recovery", async () => {
  const page = await open({route: suspendedPagePath, query: ""});
  try {
    await page.waitForFunction(() => document.querySelector("#access-heading").textContent === "Subscription access suspended");
    assert.match(await page.$eval("#access-description", e => e.textContent), /Ask your guardian/);
    await page.evaluate(() => window.setBillingAccess({allowed: true}));
    await page.waitForFunction(() => location.pathname === "/features/student/pages/landing/landing.html");
  } finally {await page.close();}
});


test("management opens without a subscription reference and offers the current linked student", async () => {
  const page = await open({query: ""});
  try {
    await ready(page);
    assert.deepEqual(await page.$$eval("#linked-student-select option", options => options.map(option => option.textContent)), ["Alice", "Ben"]);
    assert.equal(await page.$eval("#linked-student-select", select => select.value), "student-a");
    assert.match(await page.$eval("#current-plan-description", node => node.textContent), /Monthly/);
    assert.equal(await page.evaluate(() => window.studentCreates.length + window.studentSetups.length), 0);
  } finally {await page.close();}
});
test("selecting a linked student without a subscription opens plan creation and clears the prior invoice context", async () => {
  const page = await open();
  try {
    await ready(page);
    await Promise.all([page.waitForNavigation({waitUntil: "networkidle0"}), page.select("#linked-student-select", "student-b")]);
    await page.waitForFunction(() => !document.querySelector("#create-student-subscription").disabled);
    assert.match(page.url(), /studentId=student-b/); assert.equal(new URL(page.url()).searchParams.has("invoiceReference"), false);
    assert.equal(await page.$eval("#payment-heading", node => node.textContent), "Start a subscription");
    assert.equal(await page.$eval("#payment-summary", node => node.hidden), true);
    assert.equal(await page.evaluate(() => window.loads.length), 0);
  } finally {await page.close();}
});
test("a new student subscription uses the selected plan and shared saved card", async () => {
  const page = await open({query: "?studentId=student-b", checkoutSavedCard: true, width: 390});
  try {
    await page.waitForFunction(() => !document.querySelector("#create-student-subscription").disabled);
    await page.select("#subscription-plan-select", "annual");
    assert.match(await page.$eval("#selected-plan-price", node => node.textContent), /240/);
    assert.equal(await page.$eval("#checkout-saved-card", node => node.checked), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({path: "/tmp/rhx-student-billing/student-plan-mobile.png", fullPage: true});
    await Promise.all([page.waitForNavigation({waitUntil: "networkidle0"}), page.click("#create-student-subscription")]);
    const calls = await page.evaluate(() => JSON.parse(sessionStorage.getItem("rhx.test.studentCreates")));
    assert.equal(calls.length, 1); assert.equal(calls[0].studentId, "student-b");
    assert.equal(calls[0].planId, "annual"); assert.equal(calls[0].savedCardReference, "pm_saved");
    assert.equal(calls[0].quoteReference, "b".repeat(64));
    assert.match(page.url(), /complete_subscription_payment.*subscriptionReference=sub_created/);
  } finally {await page.close();}
});
test("new-card student checkout mounts secure entry and creates only after successful setup", async () => {
  const page = await open({query: "?studentId=student-b"});
  try {
    await page.waitForFunction(() => !document.querySelector("#create-student-subscription").disabled);
    await page.click("#create-student-subscription"); await formReady(page);
    assert.equal(await page.$eval("#linked-student-select", select => select.disabled), true);
    assert.equal(await page.evaluate(() => window.studentCreates.length), 0);
    assert.equal(await page.evaluate(() => window.studentSetups[0].studentId), "student-b");
    const storage = await page.evaluate(() => JSON.stringify({...sessionStorage}));
    assert.equal(storage.includes("secret_private"), false);
    await Promise.all([page.waitForNavigation({waitUntil: "networkidle0"}), page.click("#card-submit-button")]);
    const calls = await page.evaluate(() => JSON.parse(sessionStorage.getItem("rhx.test.studentCreates")));
    assert.equal(calls[0].setupIntentReference, "seti_new"); assert.equal(calls[0].studentId, "student-b");
  } finally {await page.close();}
});
test("unknown student checkout outcome retains the same attempt when finishing setup", async () => {
  const page = await open({query: "?studentId=student-b", checkoutSavedCard: true, createStudentError: "functions/unavailable"});
  try {
    await page.waitForFunction(() => !document.querySelector("#create-student-subscription").disabled);
    await page.click("#create-student-subscription");
    await page.waitForFunction(() => !document.querySelector("#finish-student-subscription").hidden && !document.querySelector("#finish-student-subscription").disabled);
    assert.equal(await page.$eval("#create-student-subscription", button => button.disabled), true);
    await page.evaluate(() => {window.fixture.createStudentError = null;});
    await Promise.all([page.waitForNavigation({waitUntil: "networkidle0"}), page.click("#finish-student-subscription")]);
    const calls = await page.evaluate(() => JSON.parse(sessionStorage.getItem("rhx.test.studentCreates")));
    assert.equal(calls.length, 2); assert.equal(calls[0].idempotencyReference, calls[1].idempotencyReference);
  } finally {await page.close();}
});
test("an untrusted new-subscription bank return cannot create a subscription", async () => {
  const page = await open({query: "?studentId=student-b&setup_intent=seti_forged&setup_intent_client_secret=private&redirect_status=succeeded"});
  try {
    await page.waitForFunction(() => !document.querySelector("#create-student-subscription").disabled);
    assert.equal(await page.evaluate(() => window.studentCreates.length), 0);
    assert.equal(page.url().includes("secret"), false);
  } finally {await page.close();}
});
test("an empty linked-student list offers dashboard guidance without payment controls", async () => {
  const page = await open({query: "", noStudents: true});
  try {
    assert.equal(await page.$eval("#payment-heading", node => node.textContent), "Link a student to continue");
    assert.equal(await page.$eval("#subscription-plan-section", node => node.hidden), true);
    assert.equal(await page.evaluate(() => window.studentCreates.length + window.studentSetups.length + window.loads.length), 0);
  } finally {await page.close();}
});
test("sign-out discards a delayed linked-student response", async () => {
  const page = await open({query: "", deferOptions: true});
  try {
    await page.waitForFunction(() => window.pendingOptions.length === 1);
    await page.evaluate(() => {window.setAuth(null); window.pendingOptions[0]({students: [{studentId: "student-a", studentName: "Private"}],
      selectedStudentId: "student-a", subscriptionReference: "sub_owner", plans: [], canCreate: false});});
    assert.equal(await page.$eval("#student-selector-panel", node => node.hidden), true);
    assert.equal(await page.$eval("#subscription-plan-section", node => node.hidden), true);
    assert.equal(await page.evaluate(() => window.loads.length), 0);
  } finally {await page.close();}
});


test("a guardian can schedule an existing student's new plan for renewal without an immediate payment", async () => {
  const page = await open({healthy: true, query: "?studentId=student-a"});
  try {
    await ready(page); assert.equal(await page.$eval("#change-subscription-plan-section", node => node.hidden), false);
    assert.equal(await page.$eval("#change-student-subscription-plan", button => button.disabled), true);
    await page.select("#change-subscription-plan-select", "annual");
    assert.match(await page.$eval("#change-plan-price", node => node.textContent), /240/);
    await page.click("#change-student-subscription-plan");
    await page.waitForFunction(() => !document.querySelector("#scheduled-plan-description").hidden);
    assert.match(await page.$eval("#scheduled-plan-description", node => node.textContent), /Annual.*scheduled/);
    assert.match(await page.$eval("#payment-status", node => node.textContent), /current paid period is unchanged/);
    assert.equal(await page.evaluate(() => window.studentPlanChanges[0].studentId), "student-a");
    assert.equal(await page.evaluate(() => window.studentPlanChanges[0].planId), "annual");
    assert.equal(await page.evaluate(() => window.studentCreates.length + window.retries.length + window.confirmations.length), 0);
  } finally {await page.close();}
});
test("an unpaid renewal offers payment recovery before changing its plan", async () => {
  const page = await open();
  try {
    await ready(page);
    assert.equal(await page.$eval("#change-subscription-plan-section", node => node.hidden), true);
    assert.equal(await page.$eval("#retry-payment-button", button => button.disabled), false);
    assert.equal(await page.evaluate(() => window.studentPlanChanges.length), 0);
  } finally {await page.close();}
});
test("an unconfirmed plan change leaves payment and sibling subscriptions untouched", async () => {
  const page = await open({healthy: true, changePlanError: "functions/unavailable"});
  try {
    await ready(page); await page.select("#change-subscription-plan-select", "annual");
    await page.click("#change-student-subscription-plan");
    await page.waitForFunction(() => document.querySelector("#payment-status").textContent.includes("plan change is not confirmed"));
    assert.equal(await page.$eval("#scheduled-plan-description", node => node.hidden), true);
    assert.equal(await page.evaluate(() => window.studentCreates.length + window.retries.length + window.confirmations.length), 0);
  } finally {await page.close();}
});
test("switching between subscribed siblings loads only the selected student's subscription and clears the old invoice", async () => {
  const page = await open({family: true});
  try {
    await ready(page);
    await Promise.all([page.waitForNavigation({waitUntil: "networkidle0"}), page.select("#linked-student-select", "student-b")]);
    await ready(page);
    assert.equal(await page.$eval("#student-name", node => node.textContent), "Ben");
    assert.equal(await page.$eval("#subscription-reference", node => node.textContent), "sub_second");
    assert.equal(await page.$eval("#invoice-reference", node => node.textContent), "in_second");
    assert.deepEqual(await page.evaluate(() => window.loads[0]), {subscriptionReference: "sub_second"});
  } finally {await page.close();}
});


test("a matching bank return resumes only the checkout explicitly started for that student", async () => {
  const page = await open({query: "?studentId=student-b&setup_intent=seti_new&redirect_status=succeeded",
    pendingStudentCheckout: {studentId: "student-b", planId: "monthly", quoteReference: "a".repeat(64),
      attempt: "authorized-attempt", setupIntentReference: "seti_new", stage: "confirming"}});
  try {
    await page.waitForFunction(() => location.pathname.includes("complete_subscription_payment"));
    const calls = await page.evaluate(() => JSON.parse(sessionStorage.getItem("rhx.test.studentCreates")));
    assert.equal(calls.length, 1); assert.equal(calls[0].studentId, "student-b");
    assert.equal(calls[0].idempotencyReference, "authorized-attempt"); assert.equal(calls[0].setupIntentReference, "seti_new");
  } finally {await page.close();}
});
test("a mismatched bank return cannot resume an existing student checkout", async () => {
  const page = await open({query: "?studentId=student-b&setup_intent=seti_other&redirect_status=succeeded",
    pendingStudentCheckout: {studentId: "student-b", planId: "monthly", quoteReference: "a".repeat(64),
      attempt: "authorized-attempt", setupIntentReference: "seti_new", stage: "confirming"}});
  try {
    assert.match(await page.$eval("#payment-error", node => node.textContent), /does not match/);
    assert.equal(await page.evaluate(() => window.studentCreates.length), 0);
  } finally {await page.close();}
});
test("plan prices use Stripe's minor units for special whole-unit currencies", async () => {
  const page = await open({query: "?studentId=student-b", options: {
    students: [{studentId: "student-b", studentName: "Ben"}], selectedStudentId: "student-b", paymentMode: "test",
    canCreate: true, subscriptionReference: null, plans: [{planId: "monthly", name: "Monthly", months: 1,
      amount: 5000, currency: "isk", quoteReference: "a".repeat(64)}]}});
  try {
    const label = await page.$eval("#selected-plan-price", node => node.textContent);
    assert.match(label, /50/); assert.doesNotMatch(label, /5,000|5000/);
  } finally {await page.close();}
});
test("new recovery offers the current plan or another plan before retrying", async () => {
  const page = await open({recoveryV2: true, width: 390});
  try {
    await ready(page); assert.equal(await page.$eval("#renewal-plan-section", n => n.hidden), false);
    assert.equal(await page.$eval("#renewal-plan-select", n => n.value), "monthly");
    await page.select("#renewal-plan-select", "annual");
    assert.match(await page.$eval("#payment-amount", n => n.textContent), /240/);
    await page.screenshot({path: "/tmp/rhx-renewal-new/manage-new-mobile.png", fullPage: true});
    await page.click("#retry-payment-button"); await page.waitForFunction(() => window.retries.length === 1);
    const request = await page.evaluate(() => window.retries[0]);
    assert.equal(request.planId, "annual"); assert.equal(request.quoteReference, "b".repeat(64));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  } finally {await page.close();}
});
test("new-card recovery uses the selected plan and safely cancels an abandoned form", async () => {
  const page = await open({recoveryV2: true});
  try {
    await ready(page); await page.select("#renewal-plan-select", "annual"); await page.click("#use-new-card-button"); await formReady(page);
    const request = await page.evaluate(() => window.actionLoads[0]); assert.equal(request.action, "new_card"); assert.equal(request.planId, "annual");
    assert.equal(await page.$eval("#renewal-plan-select", n => n.disabled), true);
    assert.equal(await page.$eval("#invoice-reference", n => n.textContent), "in_fresh");
    await page.click("#card-cancel-button"); await page.waitForFunction(() => window.actionLoads.some(a => a.action === "cancel_payment"));
    await page.waitForFunction(() => !document.querySelector("#renewal-plan-select").disabled);
    assert.equal(await page.evaluate(() => window.confirmations.length), 0);
  } finally {await page.close();}
});
test("automatic authentication failure offers manual payment without resuming an old challenge", async () => {
  const page = await open({recoveryV2: true, automaticAuthentication: true});
  try {
    await ready(page); assert.match(await page.$eval("#payment-heading", n => n.textContent), /Renewal failed.*authentication/);
    assert.equal(await page.$eval("#confirm-payment-button", n => n.hidden), true);
    assert.equal(await page.$eval("#retry-payment-button", n => n.disabled), false);
    assert.equal(await page.evaluate(() => window.confirmations.length), 0);
  } finally {await page.close();}
});
test("suspended recovery explains that expired debt was dropped", async () => {
  const page = await open({recoveryV2: true, suspended: true});
  try {await ready(page); assert.match(await page.$eval("#billing-description", n => n.textContent), /expired period has been dropped/);}
  finally {await page.close();}
});
test("permanent decline requires a new card and keeps the original grace visible", async () => {
  const page = await open({recoveryV2: true, permanentDecline: true});
  try {
    await ready(page); assert.equal(await page.$eval("#retry-payment-button", n => n.disabled), true);
    assert.equal(await page.$eval("#use-new-card-button", n => n.disabled), false);
    assert.match(await page.$eval("#payment-heading", n => n.textContent), /New card required/);
    assert.match(await page.$eval("#access-grace-until", n => n.textContent), /2030/);
  } finally {await page.close();}
});
test("guardian can cancel renewal during grace without a payment", async () => {
  const page = await open({recoveryV2: true});
  try {
    await ready(page); await page.click("#cancel-renewal-button"); await page.waitForFunction(() => document.querySelector("#payment-heading").textContent === "Automatic retries stopped");
    assert.match(await page.$eval("#billing-description", n => n.textContent), /original grace deadline/);
    assert.equal(await page.evaluate(() => window.retries.length + window.confirmations.length), 0);
  } finally {await page.close();}
});
test("an unconfirmed cancellation continues blocking another charge", async () => {
  const page = await open({recoveryV2: true, pendingRecovery: true, cannotCancel: true});
  try {
    await page.waitForFunction(() => !document.querySelector("#cancel-pending-renewal-button").disabled);
    await page.click("#cancel-pending-renewal-button");
    await page.waitForFunction(() => document.querySelector("#payment-status").textContent.includes("cannot yet be cancelled"));
    assert.equal(await page.$eval("#renewal-plan-select", n => n.disabled), true);
    assert.equal(await page.$eval("#retry-payment-button", n => n.disabled), true);
    assert.equal(await page.evaluate(() => window.retries.length), 0);
  } finally {await page.close();}
});
