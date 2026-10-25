const assert = require("node:assert/strict");
const {before, after, test} = require("node:test");
const http = require("node:http");
const fs = require("node:fs/promises");
const {existsSync} = require("node:fs");
const path = require("node:path");

const publicRoot = path.resolve(__dirname, "../../../public");
const pagePath = "/features/stripe_payment/pages/admin/stripe_payment_test.html";
let browser, server, origin;
const mocks = {
  "/features/student/student_module.js": `export async function listStudents() {
    if (window.fixture.studentError) throw new Error("Student list unavailable");
    if (window.fixture.deferStudents) return new Promise(resolve => {window.releaseStudents = resolve;});
    return window.fixture.students;
  }`,
  "/features/syllabus_subscription/subscription_plan_module.js": `export async function getSubscriptionPlanCatalog(country) {
    window.catalogRequests.push(country);
    if (window.fixture.planError) throw new Error("Plan list unavailable");
    if (window.fixture.deferPlans) return new Promise(resolve => {window.releasePlans[country] = resolve;});
    return window.fixture.catalogs[country] || null;
  }`,
  "/features/payment/payment_module.js": `export async function getPaymentConfig() {return {mode: window.fixture.mode || "test"};}`,
  "/utils/firebase/firebase_auth.js": `
    export function getCurrentFirebaseAuthUser() {return {uid: "guardian-fixture", email: "guardian@example.test"};}
    export function onFirebaseAuthStateChanged(callback) {callback(getCurrentFirebaseAuthUser()); return () => {};}`,
  "/features/stripe_payment/stripe_payment_module.js": `
    const unexpected = () => {throw new Error("Unexpected payment operation");};
    export const confirmSetup = unexpected, confirmSubscriptionPayment = unexpected,
      getStripeSubscriptionPaymentAction = unexpected;
    export async function listStripeCustomers() {
      window.customerListCalls++;
      if (window.fixture.customerError) throw new Error("Customer list unavailable");
      const result = {mode: window.fixture.mode || "test", customers: structuredClone(window.fixture.customers)};
      if (window.fixture.deferCustomers) return new Promise(resolve => window.pendingCustomers.push({resolve, result}));
      return result;
    }
    export async function createPaymentCustomer(reference, email) {
      window.fixture.customers.push({customerReference: "cus_created", email});
      return "cus_created";
    }
    export async function createStripeSetupIntent(reference) {
      window.setupCalls.push(reference); return "seti_fixture_secret_fixture";
    }
    export async function deleteCustomer(reference) {
      window.fixture.customers = window.fixture.customers.filter(c => c.customerReference !== reference);
      return reference;
    }
    export async function mountSetupPaymentElement() {return {contextReference: "stripe_setup_context_fixture", mode: window.fixture.mode || "test"};}
    export async function retrieveSetupIntent() {
      window.setupRecoveries++;
      return {setupIntentReference: "seti_fixture", status: "succeeded", paymentMethodReference: "pm_fixture"};
    }
    export async function createStripeSubscription(input) {
      window.subscriptionCalls.push(input);
      if (window.fixture.deferSubscription) await new Promise(resolve => {window.releaseSubscription = resolve;});
      return {subscriptionReference: "sub_fixture", status: "incomplete", paymentClientSecret: "pi_fixture_secret_fixture"};
    }`,
};

before(async () => {
  server = http.createServer(async (req, res) => {
    try {
      const name = new URL(req.url, "http://localhost").pathname;
      if (mocks[name]) {res.setHeader("Content-Type", "text/javascript"); res.end(mocks[name]); return;}
      const filename = path.resolve(publicRoot, "." + name);
      if (!filename.startsWith(publicRoot + path.sep)) {res.writeHead(404).end(); return;}
      let content = await fs.readFile(filename, "utf8");
      if (name.endsWith(".html")) {
        // Keep the real form and controller, replacing network services only.
        content = content.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "")
          .replace("</body>", '<script type="module" src="./stripe_payment_test.js"></script></body>');
      }
      res.setHeader("Content-Type", name.endsWith(".js") ? "text/javascript" : name.endsWith(".css") ? "text/css" : "text/html");
      res.end(content);
    } catch {res.writeHead(404).end();}
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  const {default: puppeteer} = await import("puppeteer");
  browser = await puppeteer.launch({headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
    args: ["--no-sandbox", "--disable-dev-shm-usage"]});
});
after(async () => {await browser?.close(); if (server) await new Promise(resolve => server.close(resolve));});

async function openPage({width = 1360, saved, query = "", ...overrides} = {}) {
  const page = await browser.newPage();
  await page.setViewport({width, height: 1000});
  await page.evaluateOnNewDocument(({saved, overrides}) => {
    window.fixture = {customers: [{customerReference: "cus_fixture", email: "first@example.test"},
      {customerReference: "cus_second", email: "second@example.test"}, {customerReference: "cus_saved", email: "saved@example.test"}],
      students: [{id: "student-a", name: "Alice"}, {id: "student-b", name: "Ben"}], catalogs: {
      Malaysia: {currency: "MYR", plans: [{id: "monthly", name: "Monthly", months: 1, fee: 25}, {id: "half-year", name: "Six months", months: 6, fee: 120}]},
      Singapore: {currency: "SGD", plans: [{id: "sg-monthly", name: "Singapore monthly", months: 1, fee: 10}]},
    }, ...overrides};
    window.subscriptionCalls = []; window.catalogRequests = []; window.releasePlans = {}; window.setupRecoveries = 0;
    window.setupCalls = []; window.pendingCustomers = []; window.customerListCalls = 0;
    if (saved) sessionStorage.setItem("rhx.stripePaymentTest.checkoutState.v1", JSON.stringify(saved));
  }, {saved, overrides});
  await page.goto(origin + pagePath + query, {waitUntil: "domcontentloaded"});
  await page.waitForFunction(() => document.getElementById("input-reference").value === "guardian-fixture");
  return page;
}
async function ready(page) {
  await page.waitForFunction(() => !document.getElementById("reload-subscription-options").disabled);
}
async function fillPaymentReferences(page) {
  await page.evaluate(() => {
    for (const [id, value] of [["subscription-customer-reference", "cus_fixture"], ["subscription-payment-method-reference", "pm_fixture"]]) {
      const field = document.getElementById(id); field.value = value; field.dispatchEvent(new Event("input", {bubbles: true}));
    }
  });
}
async function setCountry(page, value) {
  await page.$eval("#subscription-country", (field, value) => {
    field.value = value;
    field.dispatchEvent(new Event("input", {bubbles: true}));
    field.dispatchEvent(new Event("change", {bubbles: true}));
  }, value);
}

test("Step 5 uses live select values, requires both choices, and keeps payment confirmation working", async () => {
  for (const width of [390, 1360]) {
    const page = await openPage({width, deferSubscription: true});
    try {
      await ready(page);
      assert.equal(await page.$eval("#subscription-student-id", el => el.tagName), "SELECT");
      assert.match(await page.$eval("#subscription-student-id", el => el.textContent), /Alice \(student-a\)/);
      assert.match(await page.$eval("#subscription-plan-id", el => el.textContent), /Monthly — 1 month — MYR 25.00 \(monthly\)/);
      await fillPaymentReferences(page);
      await page.select("#subscription-student-id", "student-b");
      assert.equal(await page.$eval("#create-subscription-button", el => el.disabled), true);
      await page.select("#subscription-plan-id", "half-year");
      assert.equal(await page.$eval("#create-subscription-button", el => el.disabled), false);
      await page.$eval("#create-subscription-button", el => el.click());
      await page.waitForFunction(() => window.subscriptionCalls.length === 1);
      const sent = await page.evaluate(() => window.subscriptionCalls[0]);
      assert.equal(sent.studentId, "student-b"); assert.equal(sent.planId, "half-year"); assert.equal(sent.country, "Malaysia");
      assert.equal(await page.$eval("#subscription-student-id", el => el.disabled), true);
      await page.$eval("#create-subscription-form", el => el.dispatchEvent(new Event("submit", {cancelable: true})));
      assert.equal(await page.evaluate(() => window.subscriptionCalls.length), 1);
      await page.evaluate(() => window.releaseSubscription());
      await page.waitForFunction(() => !document.getElementById("subscription-result").hidden);
      assert.equal(await page.$eval("#confirm-subscription-payment-client-secret", el => el.value), "pi_fixture_secret_fixture");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    } finally {await page.close();}
  }
});

test("saved IDs are restored after async loading without delaying Stripe redirect recovery", async () => {
  const page = await openPage({deferStudents: true, deferPlans: true,
    saved: {studentId: "student-b", country: "Singapore", planId: "sg-monthly", customerReference: "cus_saved", idempotencyReference: "saved-attempt"},
    query: "?stripeFlow=setup&setup_intent_client_secret=seti_fixture_secret_fixture"});
  try {
    await page.waitForFunction(() => window.setupRecoveries === 1);
    assert.equal(await page.$eval("#subscription-student-id", el => el.disabled), true);
    assert.equal(await page.$eval("#create-subscription-button", el => el.disabled), true);
    await page.evaluate(() => {window.releaseStudents(window.fixture.students); window.releasePlans.Singapore(window.fixture.catalogs.Singapore);});
    await ready(page);
    assert.equal(await page.$eval("#subscription-student-id", el => el.value), "student-b");
    assert.equal(await page.$eval("#subscription-plan-id", el => el.value), "sg-monthly");
    assert.equal(await page.$eval("#subscription-idempotency-reference", el => el.value), "saved-attempt");
    assert.equal(await page.$eval("#subscription-payment-method-reference", el => el.value), "pm_fixture");
    assert.equal(await page.$eval("#create-subscription-button", el => el.disabled), false);
  } finally {await page.close();}
});

test("country changes discard stale catalog responses and clear the old plan", async () => {
  const page = await openPage({deferPlans: true});
  try {
    await page.waitForFunction(() => !!window.releasePlans.Malaysia);
    await setCountry(page, "Singapore");
    await page.waitForFunction(() => !!window.releasePlans.Singapore);
    await page.evaluate(() => window.releasePlans.Singapore(window.fixture.catalogs.Singapore));
    await ready(page);
    await page.select("#subscription-plan-id", "sg-monthly");
    await page.evaluate(() => window.releasePlans.Malaysia(window.fixture.catalogs.Malaysia));
    assert.equal(await page.$eval("#subscription-plan-id", el => el.value), "sg-monthly");
    assert.doesNotMatch(await page.$eval("#subscription-plan-id", el => el.textContent), /MYR/);
    await setCountry(page, "");
    assert.equal(await page.$eval("#subscription-plan-id", el => el.value), "");
    assert.equal(await page.$eval("#subscription-plan-id", el => el.disabled), true);
    assert.equal(await page.$eval("#create-subscription-button", el => el.disabled), true);
  } finally {await page.close();}
});

test("failed loads can be retried without losing the Stripe setup and empty lists cannot submit", async () => {
  const page = await openPage({studentError: true, planError: true});
  try {
    await ready(page); await fillPaymentReferences(page);
    assert.match(await page.$eval("#subscription-options-status", el => el.textContent), /Could not load students.*Could not load plans/);
    await page.evaluate(() => {window.fixture.studentError = false; window.fixture.planError = false;});
    await page.$eval("#reload-subscription-options", el => el.click()); await ready(page);
    assert.equal(await page.$eval("#subscription-customer-reference", el => el.value), "cus_fixture");
    await page.select("#subscription-student-id", "student-a"); await page.select("#subscription-plan-id", "monthly");
    await page.$eval("#reload-subscription-options", el => el.click()); await ready(page);
    assert.equal(await page.$eval("#subscription-student-id", el => el.value), "student-a");
    assert.equal(await page.$eval("#subscription-plan-id", el => el.value), "monthly");
    await page.evaluate(() => {window.fixture.students = []; window.fixture.catalogs = {};});
    await page.$eval("#reload-subscription-options", el => el.click()); await ready(page);
    assert.equal(await page.$eval("#subscription-student-id", el => el.selectedIndex), 0);
    assert.equal(await page.$eval("#subscription-plan-id", el => el.selectedIndex), 0);
    await page.$eval("#create-subscription-form", el => el.dispatchEvent(new Event("submit", {cancelable: true})));
    assert.equal(await page.evaluate(() => window.subscriptionCalls.length), 0);
  } finally {await page.close();}
});

test("Step 2 selects a registered customer, clears previous setup data, and locks it while mounted", async () => {
  for (const width of [390, 1360]) {
    const page = await openPage({width});
    try {
      await page.waitForFunction(() => !document.getElementById("setup-customer-reference").disabled);
      assert.equal(await page.$eval("#setup-customer-reference", el => el.tagName), "SELECT");
      assert.match(await page.$eval("#setup-customer-reference", el => el.textContent), /second@example.test \(cus_second\)/);
      assert.equal(await page.$eval("#create-setup-intent-button", el => el.disabled), true);
      await page.evaluate(() => {
        document.getElementById("subscription-payment-method-reference").value = "pm_previous";
        document.getElementById("mount-client-secret").value = "seti_previous_secret_previous";
      });
      await page.select("#setup-customer-reference", "cus_second");
      assert.equal(await page.$eval("#subscription-customer-reference", el => el.value), "cus_second");
      assert.equal(await page.$eval("#subscription-payment-method-reference", el => el.value), "");
      assert.equal(await page.$eval("#mount-client-secret", el => el.value), "");
      await page.$eval("#create-setup-intent-button", el => el.click());
      await page.waitForFunction(() => !document.getElementById("client-secret-result").hidden);
      assert.deepEqual(await page.evaluate(() => window.setupCalls), ["cus_second"]);
      assert.equal(await page.$eval("#mount-client-secret", el => el.value), "seti_fixture_secret_fixture");
      await page.$eval("#mount-payment-element-button", el => el.click());
      await page.waitForFunction(() => !document.getElementById("setup-context-result").hidden);
      assert.equal(await page.$eval("#setup-customer-reference", el => el.disabled), true);
      assert.equal(await page.$eval("#reload-stripe-customers", el => el.disabled), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    } finally {await page.close();}
  }
});

test("a newly created customer is selected even when an earlier list response arrives late", async () => {
  const page = await openPage({deferCustomers: true});
  try {
    await page.waitForFunction(() => window.pendingCustomers.length === 1);
    await page.$eval("#setup-intent-form", el => el.dispatchEvent(new Event("submit", {cancelable: true})));
    assert.equal(await page.evaluate(() => window.setupCalls.length), 0);
    await page.$eval("#create-customer-button", el => el.click());
    await page.waitForFunction(() => window.pendingCustomers.length === 2);
    await page.evaluate(() => window.pendingCustomers[1].resolve(window.pendingCustomers[1].result));
    await page.waitForFunction(() => document.getElementById("setup-customer-reference").value === "cus_created");
    await page.evaluate(() => window.pendingCustomers[0].resolve(window.pendingCustomers[0].result));
    assert.equal(await page.$eval("#setup-customer-reference", el => el.value), "cus_created");
    assert.equal(await page.$eval("#subscription-customer-reference", el => el.value), "cus_created");
  } finally {await page.close();}
});

test("customer reloads recover failures, restore a saved choice, and clear deleted choices", async () => {
  const page = await openPage({saved: {customerReference: "cus_saved", country: "Malaysia"}});
  try {
    await page.waitForFunction(() => !document.getElementById("reload-stripe-customers").disabled);
    assert.equal(await page.$eval("#setup-customer-reference", el => el.value), "cus_saved");
    await page.evaluate(() => {window.fixture.customerError = true;});
    await page.$eval("#reload-stripe-customers", el => el.click());
    await page.waitForFunction(() => document.getElementById("stripe-customer-options-status").classList.contains("is-error"));
    assert.equal(await page.$eval("#create-setup-intent-button", el => el.disabled), true);
    await page.evaluate(() => {window.fixture.customerError = false;});
    await page.$eval("#reload-stripe-customers", el => el.click());
    await page.waitForFunction(() => !document.getElementById("setup-customer-reference").disabled);
    await page.select("#setup-customer-reference", "cus_second");
    await page.evaluate(() => {
      const field = document.getElementById("stripe-customer-reference"); field.value = "cus_second";
      field.dispatchEvent(new Event("input", {bubbles: true}));
      const consent = document.getElementById("confirm-delete"); consent.checked = true;
      consent.dispatchEvent(new Event("change", {bubbles: true}));
    });
    await page.$eval("#delete-customer-button", el => el.click());
    await page.waitForFunction(() => document.getElementById("delete-status").textContent.includes("was deleted"));
    await page.waitForFunction(() => !document.getElementById("reload-stripe-customers").disabled);
    assert.equal(await page.$eval("#setup-customer-reference", el => el.value), "");
    assert.doesNotMatch(await page.$eval("#setup-customer-reference", el => el.textContent), /cus_second/);
    assert.equal(await page.$eval("#create-setup-intent-button", el => el.disabled), true);
    await page.evaluate(() => {window.fixture.mode = "prod"; window.fixture.customers = [{customerReference: "cus_live", email: "live@example.test"}];});
    await page.$eval("#reload-stripe-customers", el => el.click());
    await page.waitForFunction(() => document.getElementById("stripe-customer-options-status").textContent.includes("PROD"));
    assert.doesNotMatch(await page.$eval("#setup-customer-reference", el => el.textContent), /cus_fixture|cus_saved/);
  } finally {await page.close();}
});
