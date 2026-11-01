const assert = require("node:assert/strict");
const {test} = require("node:test");
const {fixture} = require("./test_support/stripe_invoice_fixture");
const {ManageStripeSubscriptionPayment} = require("./application/manage_stripe_subscription_payment");
const {ProcessStripeSubscriptionEvent} = require("./application/process_stripe_subscription_event");
const input = {internalReference: "owner", subscriptionReference: "sub_owner"};

function familyFixture(mode = "test") {
  const f = managementFixture(mode);
  f.state.subscription.latest_invoice = null;
  const subscriptions = new Map([["sub_owner", f.state.subscription], ["sub_second", {
    ...structuredClone(f.state.subscription), id: "sub_second", status: "active"}]]);
  const records = new Map([...subscriptions.keys()].map((ref, i) => [ref, {
    mode, customerReference: "cus_owner", subscriptionReference: ref,
    studentId: i ? "student-b" : "student-a", planId: i ? "yearly" : "monthly"}]));
  const links = new Map([["student-a", "active"], ["student-b", "active"]]);
  const storedSetups = new Map(), applied = new Map();
  const deps = f.manager.dependencies;
  deps.listSubscriptionRecords = async () => [...records.values()];
  deps.getSubscriptionRecord = async ({subscriptionReference}) => records.get(subscriptionReference) || null;
  deps.getGuardianStudentLink = async ({guardianId, studentId}) => {
    assert.equal(guardianId, "owner"); return {state: links.get(studentId)};
  };
  deps.getStudentById = async id => ({name: id === "student-a" ? "Alice" : "Ben"});
  deps.writeSetupIntentRecord = async record => {storedSetups.set(record.setupIntentReference, structuredClone(record));};
  deps.getSetupIntentRecord = async ({setupIntentReference}) => storedSetups.get(setupIntentReference);
  f.stripe.stripeClient.subscriptions.retrieve = async ref => structuredClone(subscriptions.get(ref));
  f.stripe.stripeClient.subscriptions.update = async (ref, params, options) => {
    f.state.calls.push(["update-card", ref, params, options]);
    if (f.state.failUpdate === ref) throw Error("private provider failure");
    if (!applied.has(options.idempotencyKey)) {
      Object.assign(subscriptions.get(ref), {default_payment_method: params.default_payment_method,
        payment_settings: params.payment_settings});
      applied.set(options.idempotencyKey, structuredClone(subscriptions.get(ref)));
    }
    return applied.get(options.idempotencyKey);
  };
  async function setupAll() {
    await f.manager.createCardSetup({...input, cardChangeScope: "all_students", idempotencyReference: "family-save"});
    const intent = f.setupIntents.get("seti_change"); intent.status = "succeeded"; intent.payment_method = "pm_new";
    return intent;
  }
  return {...f, subscriptions, records, links, storedSetups, setupAll};
}

function managementFixture(mode = "test") {
  const f = fixture(mode), {state, stripe, dependencies} = f;
  const setupWrites = [], methodWrites = [], setupIntents = new Map(), applied = new Map();
  const newMethod = {...state.method, id: "pm_new", card: {...state.method.card, last4: "4444"}};
  const now = new Date();
  stripe.stripeClient.paymentMethods.retrieve = async id => {
    state.calls.push(["method", id]); return structuredClone(id === "pm_new" ? newMethod : state.method);
  };
  stripe.stripeClient.setupIntents = {
    async create(params, options) {
      state.calls.push(["setup", params, options]);
      const intent = {id: "seti_change", customer: params.customer,
        client_secret: "seti_change_secret_private", status: "requires_payment_method",
        usage: params.usage, metadata: {...params.metadata}, created: Math.floor(now.getTime() / 1000)};
      setupIntents.set(intent.id, intent); return structuredClone(intent);
    },
    async retrieve(id) {return structuredClone(setupIntents.get(id));},
  };
  stripe.stripeClient.subscriptions.update = async (id, params, options) => {
    state.calls.push(["update-card", id, params, options]);
    if (applied.has(options.idempotencyKey)) return applied.get(options.idempotencyKey);
    state.subscription.default_payment_method = params.default_payment_method;
    state.subscription.payment_settings = params.payment_settings;
    const result = structuredClone(state.subscription);
    applied.set(options.idempotencyKey, result); return result;
  };
  const manager = new ManageStripeSubscriptionPayment({...dependencies,
    now: () => now, writeSetupIntentRecord: async record => setupWrites.push(record),
    writePaymentMethodRecord: async record => methodWrites.push(record)});
  async function completedSetup() {
    await manager.createCardSetup({...input, idempotencyReference: "explicit-save-attempt"});
    const intent = setupIntents.get("seti_change");
    intent.status = "succeeded"; intent.payment_method = "pm_new";
    return intent;
  }
  return {...f, manager, setupWrites, methodWrites, setupIntents, completedSetup, newMethod, now};
}

test("management indicates failed renewal from live invoice and displays current card", async () => {
  const {manager, state} = managementFixture();
  const result = await manager.getDetails(input);
  assert.equal(result.paymentState, "failed");
  assert.equal(result.renewal.failureCode, "insufficient_funds");
  assert.equal(result.renewal.amountDue, 2500);
  assert.equal(result.renewal.canPayWithNewCard, true);
  assert.equal(result.currentCard.last4, "4242");
  assert.equal(result.canChangeCard, true);
  assert.equal(result.renewal.paymentClientSecret, null);
  assert.equal(state.charges, 0);
});

test("missing customer ownership or subscription registration rejects a lookup before Stripe is called", async () => {
  for (const unavailable of ["owner", "registered"]) {
    const {manager, state} = managementFixture();
    state[unavailable] = false;
    await assert.rejects(() => manager.getDetails(input), error => error.code === "not-found");
    assert.deepEqual(state.calls, []);
    assert.equal(state.charges, 0);
  }
});

test("healthy, trialing, and paused subscriptions allow future-card setup without an unpaid invoice", async () => {
  for (const status of ["active", "trialing", "paused"]) {
    const {manager, state} = managementFixture();
    state.subscription.status = status; state.subscription.latest_invoice = null;
    const details = await manager.getDetails(input);
    assert.equal(details.canChangeCard, true);
    assert.equal(details.renewal, null);
    assert.equal(details.paymentState, "no_invoice");
    await manager.createCardSetup({...input, idempotencyReference: "save-only"});
    assert.equal(state.charges, 0);
  }
});

test("paid, processing, authentication, and unpaid states are not mislabeled failed", async () => {
  for (const [invoice, intent, expected] of [["paid", "succeeded", "paid"],
    ["open", "processing", "processing"], ["open", "succeeded", "processing"],
    ["open", "requires_action", "authentication_required"], ["open", "requires_confirmation", "unpaid"]]) {
    const {manager, state} = managementFixture();
    state.invoice.status = invoice; state.intent.status = intent;
    state.subscription.status = "active";
    state.intent.last_payment_error = null;
    state.invoice.attempted = false;
    assert.equal((await manager.getDetails(input)).paymentState, expected);
  }
});

test("subscription-bound SetupIntent uses off-session card-only setup with ownership metadata", async () => {
  const {manager, state, setupWrites} = managementFixture();
  const result = await manager.createCardSetup({...input, idempotencyReference: "save-attempt", customerReference: "cus_forged"});
  assert.deepEqual(result, {setupIntentReference: "seti_change", clientSecret: "seti_change_secret_private"});
  const call = state.calls.find(c => c[0] === "setup");
  assert.equal(call[1].customer, "cus_owner");
  assert.equal(call[1].usage, "off_session");
  assert.deepEqual(call[1].payment_method_types, ["card"]);
  assert.deepEqual(call[1].metadata, {purpose: "subscription_card_update", mode: "test", subscriptionReference: "sub_owner", internalReference: "owner"});
  assert.match(call[2].idempotencyKey, /^subscription-card-setup-/);
  assert.equal(setupWrites[0].setupIntentReference, "seti_change");
  assert.equal(JSON.stringify(setupWrites).includes("secret"), false);
  assert.equal(state.charges, 0);
});

test("saving a successful setup changes only the subscription default, without paying or changing billing dates", async () => {
  for (const mode of ["test", "prod"]) {
    const {manager, state, completedSetup, methodWrites} = managementFixture(mode);
    const originalInvoice = structuredClone(state.invoice);
    const originalDates = [state.subscription.current_period_start, state.subscription.current_period_end];
    await completedSetup();
    const details = await manager.updateCard({...input, setupIntentReference: "seti_change", paymentMethodReference: "pm_forged"});
    assert.equal(details.currentCard.last4, "4444");
    assert.equal(state.subscription.default_payment_method, "pm_new");
    assert.deepEqual(state.invoice, originalInvoice);
    assert.deepEqual([state.subscription.current_period_start, state.subscription.current_period_end], originalDates);
    assert.equal(methodWrites[0].mode, mode);
    assert.equal(methodWrites[0].paymentMethodReference, "pm_new");
    assert.equal(state.charges, 0);
    await manager.updateCard({...input, setupIntentReference: "seti_change"});
    assert.equal(state.calls.filter(c => c[0] === "update-card").length, 1);
  }
});

test("new-card payment context exposes only an eligible current renewal secret on explicit request", async () => {
  const {get, state} = managementFixture();
  assert.equal((await get.execute({...input, invoiceReference: "in_due"})).paymentClientSecret, null);
  const result = await get.execute({...input, invoiceReference: "in_due", paymentMethodChoice: "new_card"});
  assert.equal(result.action, "enter_new_card");
  assert.equal(result.paymentClientSecret, "pi_due_secret_private");
  assert.equal(state.charges, 0);
  state.invoice.status = "paid";
  assert.equal((await get.execute({...input, invoiceReference: "in_due", paymentMethodChoice: "new_card"})).paymentClientSecret, null);
});

test("setup status, purpose, mode, customer, guardian, subscription and card ownership are verified on server", async () => {
  for (const mutate of [i => {i.status = "requires_action";}, i => {i.usage = "on_session";},
    i => {i.customer = "cus_other";}, i => {i.metadata.purpose = "unrelated";},
    i => {i.metadata.internalReference = "other";}, i => {i.metadata.subscriptionReference = "sub_other";},
    i => {i.metadata.mode = "prod";}, i => {i.payment_method = null;}]) {
    const {manager, state, completedSetup} = managementFixture();
    mutate(await completedSetup());
    await assert.rejects(() => manager.updateCard({...input, setupIntentReference: "seti_change"}), e => e.code === "failed-precondition");
    assert.equal(state.calls.filter(c => c[0] === "update-card").length, 0);
  }
  const {manager, state, completedSetup, newMethod} = managementFixture();
  await completedSetup(); newMethod.customer = "cus_other";
  await assert.rejects(() => manager.updateCard({...input, setupIntentReference: "seti_change"}));
  assert.equal(state.subscription.default_payment_method, "pm_saved");
});

test("expired or canceled setup cannot overwrite a later card", async () => {
  const {manager, state, completedSetup, now} = managementFixture();
  const intent = await completedSetup();
  intent.created = Math.floor(now.getTime() / 1000) - 24 * 60 * 60;
  await assert.rejects(() => manager.updateCard({...input, setupIntentReference: "seti_change"}), /expired/);
  assert.equal(state.subscription.default_payment_method, "pm_saved");
});

test("unauthorized and canceled subscriptions cannot create setups or mutate defaults", async () => {
  for (const mutation of [state => {state.owner = false;}, state => {state.registered = false;},
    state => {state.subscription.status = "canceled";}, state => {state.subscription.status = "incomplete_expired";}]) {
    const {manager, state} = managementFixture(); mutation(state);
    await assert.rejects(() => manager.createCardSetup({...input, idempotencyReference: "attempt"}));
    assert.equal(state.calls.filter(c => c[0] === "setup").length, 0);
  }
});

test("read-only management identifies outdated invoice links without enabling an unnoticed newer payment", async () => {
  const {manager, stripe, state} = managementFixture();
  const retrieve = stripe.stripeClient.invoices.retrieve;
  stripe.stripeClient.invoices.retrieve = async id => id === "in_old"
    ? {...state.invoice, id: "in_old", status: "paid", amount_remaining: 0, confirmation_secret: null}
    : retrieve(id);
  const details = await manager.getDetails({...input, invoiceReference: "in_old"});
  assert.equal(details.linkedInvoiceIsCurrent, false);
  assert.equal(details.renewal.invoiceReference, "in_due");
  assert.equal(details.paymentState, "failed");
  assert.equal(state.charges, 0);
});

test("paid webhook saves the actual current card metadata and preserves checkout identity", async () => {
  const {makeStripeWebhookFixture} = require("./test_support/stripe_webhook_fixture");
  const f = await makeStripeWebhookFixture();
  f.state.subscription.default_payment_method = "pm_new";
  f.state.method.id = "pm_new"; f.state.method.card.last4 = "4444";
  f.pay(); await f.process(f.event("invoice.paid"));
  const method = await f.records.getPaymentMethodRecord({mode: f.mode, customerReference: "cus_one", paymentMethodReference: "pm_new"});
  assert.equal(method.card.last4, "4444");
  const identity = await f.records.getSubscriptionRecord({mode: f.mode, customerReference: "cus_one", subscriptionReference: "sub_one"});
  assert.equal(identity.paymentMethodReference, "pm_one");
});

test("a missing or detached old card does not block saving a replacement", async () => {
  for (const missing of [true, false]) {
    const {manager, state, stripe, completedSetup} = managementFixture();
    const retrieve = stripe.stripeClient.paymentMethods.retrieve;
    stripe.stripeClient.paymentMethods.retrieve = async id => {
      if (id !== "pm_saved") return retrieve(id);
      if (missing) throw Object.assign(Error("deleted"), {code: "resource_missing"});
      return {...state.method, customer: null};
    };
    const details = await manager.getDetails(input);
    assert.equal(details.currentCard, null);
    assert.equal(details.canChangeCard, true);
    await completedSetup();
    assert.equal((await manager.updateCard({...input, setupIntentReference: "seti_change"})).currentCard.last4, "4444");
    assert.equal(state.charges, 0);
  }
});

test("after saving a replacement, explicit retry uses the new current card despite an old invoice override", async () => {
  const {manager, state, completedSetup, retry} = managementFixture();
  state.invoice.default_payment_method = "pm_saved";
  state.intent.payment_method = "pm_saved";
  state.intent.last_payment_error = {code: "expired_card", payment_method: "pm_saved"};
  await completedSetup();
  await manager.updateCard({...input, setupIntentReference: "seti_change"});
  assert.equal(state.charges, 0);
  await retry.execute({...input, invoiceReference: "in_due", idempotencyReference: "pay-new-default"});
  assert.equal(state.calls.find(c => c[0] === "pay")[2].payment_method, "pm_new");
  assert.equal(state.charges, 1);
});

test("late replay of an earlier card update does not overwrite a newer current default", async () => {
  const {manager, state, completedSetup} = managementFixture();
  await completedSetup();
  await manager.updateCard({...input, setupIntentReference: "seti_change"});
  state.subscription.default_payment_method = "pm_saved"; // A later explicit update.
  const result = await manager.updateCard({...input, setupIntentReference: "seti_change"});
  assert.equal(state.subscription.default_payment_method, "pm_saved");
  assert.equal(result.currentCard.last4, "4242");
  assert.equal(state.charges, 0);
});

test("family card management identifies students and excludes ineligible or unlinked subscriptions", async () => {
  const f = familyFixture();
  let details = await f.manager.getDetails(input);
  assert.equal(details.studentName, "Alice");
  assert.equal(details.canChangeAllStudents, true);
  assert.deepEqual(details.cardChangeTargets.map(t => t.studentName), ["Alice", "Ben"]);
  f.subscriptions.get("sub_second").status = "canceled";
  assert.equal((await f.manager.getDetails(input)).canChangeAllStudents, false);
  f.subscriptions.get("sub_second").status = "active";
  f.links.set("student-b", "inactive");
  assert.equal((await f.manager.getDetails(input)).cardChangeTargets.length, 1);
  assert.equal(f.state.charges, 0);
});

test("one verified card setup updates each student's explicit default in the selected mode without charging", async () => {
  for (const mode of ["test", "prod"]) {
    const f = familyFixture(mode);
    await f.setupAll();
    const result = await f.manager.updateCard({...input, setupIntentReference: "seti_change", cardChangeScope: "all_students"});
    assert.deepEqual(result.cardUpdateResult, {scope: "all_students", updated: ["sub_owner", "sub_second"], failed: [], skipped: []});
    for (const subscription of f.subscriptions.values()) assert.equal(subscription.default_payment_method, "pm_new");
    const updates = f.state.calls.filter(c => c[0] === "update-card");
    assert.equal(new Set(updates.map(c => c[3].idempotencyKey)).size, 2);
    assert.equal(f.state.charges, 0);
    await f.manager.updateCard({...input, setupIntentReference: "seti_change", cardChangeScope: "all_students"});
    assert.equal(f.state.calls.filter(c => c[0] === "update-card").length, 2);
  }
});

test("single-student card setup cannot be widened to all students and family setup cannot be silently narrowed", async () => {
  const f = familyFixture();
  await f.completedSetup();
  await assert.rejects(() => f.manager.updateCard({...input, setupIntentReference: "seti_change", cardChangeScope: "all_students"}),
    e => e.code === "failed-precondition");
  await f.setupAll();
  await assert.rejects(() => f.manager.updateCard({...input, setupIntentReference: "seti_change"}), e => e.code === "failed-precondition");
  assert.equal(f.state.calls.filter(c => c[0] === "update-card").length, 0);
});

test("family update uses its frozen selection and does not pick up subscriptions added during authentication", async () => {
  const f = familyFixture();
  await f.setupAll();
  f.records.set("sub_later", {...f.records.get("sub_second"), subscriptionReference: "sub_later"});
  f.subscriptions.set("sub_later", {...f.subscriptions.get("sub_second"), id: "sub_later"});
  const result = await f.manager.updateCard({...input, setupIntentReference: "seti_change", cardChangeScope: "all_students",
    subscriptionReferences: ["sub_forged"]});
  assert.deepEqual(result.cardUpdateResult.updated, ["sub_owner", "sub_second"]);
  assert.equal(f.subscriptions.get("sub_later").default_payment_method, "pm_saved");
});

test("family update reports partial failure and finishing the same setup retries safely", async () => {
  const f = familyFixture(); await f.setupAll(); f.state.failUpdate = "sub_second";
  const request = {...input, setupIntentReference: "seti_change", cardChangeScope: "all_students"};
  const partial = await f.manager.updateCard(request);
  assert.deepEqual(partial.cardUpdateResult.failed, ["sub_second"]);
  assert.deepEqual(partial.cardUpdateResult.updated, ["sub_owner"]);
  assert.equal(JSON.stringify(partial).includes("private provider failure"), false);
  f.state.failUpdate = null;
  const result = await f.manager.updateCard(request);
  assert.deepEqual(result.cardUpdateResult.failed, []);
  assert.equal(f.state.calls.filter(c => c[0] === "update-card" && c[1] === "sub_owner").length, 1);
  const keys = f.state.calls.filter(c => c[0] === "update-card" && c[1] === "sub_second").map(c => c[3].idempotencyKey);
  assert.equal(new Set(keys).size, 1);
  assert.equal(f.state.charges, 0);
});

test("family update rechecks guardian links, registration, Stripe owner and canceled state before each write", async () => {
  for (const mutate of [f => f.links.set("student-b", "inactive"), f => f.records.delete("sub_second"),
    f => {f.subscriptions.get("sub_second").status = "canceled";},
    f => {f.subscriptions.get("sub_second").customer = "cus_someone_else";},
    f => {f.records.get("sub_second").mode = "prod";}]) {
    const f = familyFixture(); await f.setupAll(); mutate(f);
    const result = await f.manager.updateCard({...input, setupIntentReference: "seti_change", cardChangeScope: "all_students"});
    assert.equal(result.cardUpdateResult.updated.includes("sub_second"), false);
    assert.equal(f.state.calls.some(c => c[0] === "update-card" && c[1] === "sub_second"), false);
  }
});

test("missing or changed family selection cannot change cards", async () => {
  for (const mutate of [f => f.storedSetups.clear(), f => f.storedSetups.get("seti_change").cardUpdate.targets.pop()]) {
    const f = familyFixture(); await f.setupAll(); mutate(f);
    await assert.rejects(() => f.manager.updateCard({...input, setupIntentReference: "seti_change", cardChangeScope: "all_students"}),
      e => e.code === "failed-precondition");
    assert.equal(f.state.calls.some(c => c[0] === "update-card"), false);
  }
});


test("family replay reports a later different card instead of claiming a cached update replaced it", async () => {
  const f = familyFixture(); await f.setupAll();
  const request = {...input, setupIntentReference: "seti_change", cardChangeScope: "all_students"};
  await f.manager.updateCard(request);
  f.subscriptions.get("sub_second").default_payment_method = "pm_saved";
  const replay = await f.manager.updateCard(request);
  assert.deepEqual(replay.cardUpdateResult.failed, ["sub_second"]);
  assert.equal(f.subscriptions.get("sub_second").default_payment_method, "pm_saved");
  assert.equal(f.state.charges, 0);
});

test("expired family setup asks for a new setup before changing cards", async () => {
  const f = familyFixture(); const intent = await f.setupAll(); intent.created -= 24 * 60 * 60;
  await assert.rejects(() => f.manager.updateCard({...input, setupIntentReference: "seti_change", cardChangeScope: "all_students"}),
    e => e.code === "failed-precondition" && /expired/.test(e.message));
  assert.equal(f.state.calls.some(c => c[0] === "update-card"), false);
});
