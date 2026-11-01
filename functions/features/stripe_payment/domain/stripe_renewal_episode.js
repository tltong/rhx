const {key} = require("./stripe_subscription_card");
const {releaseAppliedPlanSchedule} = require("./stripe_subscription_plan_change");
const {addBillingMonths} = require("../../syllabus_subscription/domain/renewal_recovery");
const FULL_PAUSE_VERSION = "2026-10-28.endive";
const ref = v => typeof v === "object" ? v?.id : v;
const fail = message => Object.assign(Error(message), {code: "failed-precondition"});
const options = (e, stage) => ({idempotencyKey: key("renewal-v2-", [e.id, e.attempt?.id || "episode", stage])});
function metadata(e) {return {rhx_recovery_version: "2", rhx_episode: e.id,
  rhx_student: e.studentId, rhx_subscription: e.subscriptionReference,
  rhx_attempt: e.attempt.id, rhx_plan: e.attempt.planId};}
function verify(object, e, kind) {
  if (ref(object.customer) !== e.customerReference || object.livemode !== (e.mode === "prod")
    || object.metadata?.rhx_recovery_version !== "2" || object.metadata?.rhx_student !== e.studentId
    || object.metadata?.rhx_episode !== e.id || object.metadata?.rhx_attempt !== e.attempt.id
    || object.metadata?.rhx_subscription !== e.subscriptionReference) throw fail(`Unexpected recovery ${kind} ownership.`);
}
async function subscription(client, e) {
  const s = await client.subscriptions.retrieve(e.subscriptionReference);
  if (s.id !== e.subscriptionReference || ref(s.customer) !== e.customerReference
    || s.livemode !== (e.mode === "prod")) throw fail("Unexpected subscription owner or mode.");
  return s;
}
async function ensurePaused(client, e) {
  let s = await subscription(client, e);
  if (s.status === "paused") {
    if (s.metadata?.rhx_episode !== e.id) throw fail("An unrelated pause needs billing review.");
    return;
  }
  if (s.schedule) s = await releaseAppliedPlanSchedule(client, s);
  if (s.billing_mode?.type !== "flexible" || !["active", "past_due"].includes(s.status)
    || s.collection_method !== "charge_automatically" || s.pending_update || s.pending_invoice_item_interval
    || s.billing_schedules?.length || s.items?.data?.length !== 1
    || s.items.data[0].quantity !== 1 || s.items.data[0].price?.recurring?.usage_type === "metered"
    || s.automatic_tax?.enabled || s.discounts?.length) throw fail("This subscription needs billing review before recovery.");
  await client.subscriptions.update(s.id, {metadata: {rhx_recovery_version: "2", rhx_episode: e.id,
    rhx_recovery_state: "held", rhx_recovery_invoice: e.originalInvoiceReference}}, options(e, "mark-hold"));
  await client.rawRequest("POST", `/v1/subscriptions/${s.id}/pause`, {
    bill_for: {unused_time_from: {type: "none"}, outstanding_usage_through: {type: "none"}},
    invoicing_behavior: "pending_invoice_item",
  }, {...options(e, "pause"), apiVersion: FULL_PAUSE_VERSION});
  s = await subscription(client, e);
  if (s.status !== "paused" || s.metadata?.rhx_episode !== e.id) throw Error("Full billing pause is not confirmed.");
}
async function dropInvoice(client, e, invoiceReference) {
  let i = await client.invoices.retrieve(invoiceReference, {expand: ["payments.data.payment.payment_intent"]});
  if (i.id !== invoiceReference || ref(i.customer) !== e.customerReference || i.livemode !== (e.mode === "prod")) throw fail("Unexpected invoice owner.");
  if (invoiceReference === e.originalInvoiceReference) {
    if (ref(i.parent?.subscription_details?.subscription || i.subscription) !== e.subscriptionReference
      || i.billing_reason !== "subscription_cycle") throw fail("Unexpected original renewal invoice.");
  } else verify(i, e, "invoice");
  if (i.status === "void") return {dropped: true};
  if (i.status === "paid") return {paid: true};
  const payments = i.payments?.data || [];
  if (i.payments?.has_more) throw fail("Invoice payments need review.");
  if (payments.some(p => ["processing", "succeeded"].includes(p.payment?.payment_intent?.status))) return {pending: true};
  if (i.status === "draft") i = await client.invoices.finalizeInvoice(i.id, {auto_advance: false},
    options(e, "finalize-void-" + i.id));
  if (i.status !== "open") throw fail("This unpaid invoice cannot be safely voided.");
  i = await client.invoices.voidInvoice(i.id, {}, options(e, "void-" + i.id));
  if (i.status !== "void") throw Error("Invoice cancellation is not confirmed.");
  return {dropped: true};
}
async function createDraft(client, e) {
  const a = e.attempt;
  await ensurePaused(client, e);
  const customer = await client.customers.retrieve(e.customerReference);
  if (customer.deleted || customer.balance !== 0 || Object.values(customer.invoice_credit_balance || {}).some(amount => amount !== 0)) {
    throw fail("Customer credits need billing review before a new recovery payment.");
  }
  const price = await client.prices.retrieve(a.priceReference);
  if (price.type !== "recurring" || price.unit_amount !== a.terms.amount || price.currency !== a.terms.currency
    || price.recurring?.interval !== a.terms.interval || price.recurring?.interval_count !== a.terms.intervalCount
    || price.recurring?.usage_type === "metered") throw fail("The Stripe price does not match the selected subscription plan.");
  const invoice = await client.invoices.create({customer: e.customerReference, currency: a.terms.currency,
    auto_advance: false, pending_invoice_items_behavior: "exclude", collection_method: "charge_automatically",
    automatic_tax: {enabled: false}, discounts: [],
    metadata: metadata(e), description: `Subscription renewal for ${e.studentId}: ${a.planId}`}, options(e, "invoice"));
  verify(invoice, e, "invoice");
  if (invoice.status !== "draft") throw fail("Recovery invoice is no longer a draft.");
  const start = Math.floor(a.createdAt.getTime() / 1000), end = Math.floor(addBillingMonths(a.createdAt, a.durationMonths).getTime() / 1000);
  const item = await client.invoiceItems.create({customer: e.customerReference, invoice: invoice.id,
    amount: a.terms.amount, currency: a.terms.currency, description: `${a.planId} subscription (${a.durationMonths} months)`,
    period: {start, end}, metadata: metadata(e)}, options(e, "invoice-line"));
  return {invoiceReference: invoice.id, invoiceItemReference: item.id};
}
async function createPayment(client, e) {
  const a = e.attempt;
  const p = await client.paymentIntents.create({customer: e.customerReference, amount: a.terms.amount,
    currency: a.terms.currency, payment_method_types: ["card"], capture_method: "automatic",
    ...(a.paymentMethodReference ? {payment_method: a.paymentMethodReference} : {setup_future_usage: "off_session"}),
    metadata: metadata(e), description: `Subscription payment for ${e.studentId}: ${a.planId}`}, options(e, "payment"));
  verify(p, e, "payment");
  return {paymentIntentReference: p.id};
}
async function payment(client, e) {
  const a = e.attempt;
  const p = await client.paymentIntents.retrieve(a.paymentIntentReference, {expand: ["latest_charge.balance_transaction"]});
  verify(p, e, "payment");
  if (p.amount !== a.terms.amount || p.currency !== a.terms.currency || p.id !== a.paymentIntentReference
    || p.status === "succeeded" && p.amount_received !== a.terms.amount) throw fail("Unexpected recovery payment amount.");
  let paidAt = null;
  if (p.status === "succeeded") {
    // Charge creation can precede 3DS. The balance transaction is created when
    // money is captured; a signed success webhook supplies a fallback timestamp.
    const captured = p.latest_charge?.balance_transaction?.created;
    const seconds = Number.isSafeInteger(captured) ? captured : a.successEventAt && Math.floor(a.successEventAt.getTime() / 1000);
    if (Number.isSafeInteger(seconds)) paidAt = new Date(seconds * 1000);
  }
  return {status: p.status, clientSecret: p.client_secret,
    failureCode: p.last_payment_error?.decline_code || p.last_payment_error?.code || null,
    paymentMethodReference: ref(p.payment_method), paidAt};
}
async function confirm(client, e) {
  try {await client.paymentIntents.confirm(e.attempt.paymentIntentReference,
    {payment_method: e.attempt.paymentMethodReference, off_session: e.attempt.kind === "automatic"}, options(e, "confirm"));}
  catch (err) {if (err.type !== "StripeCardError" && err.rawType !== "card_error") throw err;}
  return payment(client, e);
}
async function cancelPayment(client, e) {
  let p = await payment(client, e);
  if (p.status === "succeeded") return {paid: true};
  if (p.status === "processing") return {pending: true};
  if (p.status !== "canceled") {
    try {await client.paymentIntents.cancel(e.attempt.paymentIntentReference, {}, options(e, "cancel"));}
    catch (err) {
      p = await payment(client, e);
      if (p.status === "succeeded") return {paid: true};
      if (p.status !== "canceled") throw err;
    }
  }
  p = await payment(client, e);
  return p.status === "canceled" ? {cancelled: true} : {pending: true};
}
async function settleInvoice(client, e) {
  const a = e.attempt, p = await payment(client, e);
  if (p.status !== "succeeded" || !a.paidAt || !a.paidThrough) throw fail("A successful payment is required to settle the new invoice.");
  let i = await client.invoices.retrieve(a.invoiceReference);
  verify(i, e, "invoice");
  if (i.status === "draft") {
    await client.invoiceItems.update(a.invoiceItemReference, {period: {
      start: Math.floor(a.paidAt.getTime() / 1000), end: Math.floor(a.paidThrough.getTime() / 1000)}}, options(e, "coverage-dates"));
    i = await client.invoices.finalizeInvoice(i.id, {auto_advance: false}, options(e, "finalize"));
  }
  if (i.status === "open") i = await client.invoices.attachPayment(i.id, {payment_intent: a.paymentIntentReference}, options(e, "attach"));
  if (i.status !== "paid" || i.amount_remaining !== 0 || i.amount_paid !== a.terms.amount
    || i.lines?.has_more || i.lines?.data?.length !== 1
    || i.lines.data[0].period.start !== Math.floor(a.paidAt.getTime() / 1000)
    || i.lines.data[0].period.end !== Math.floor(a.paidThrough.getTime() / 1000)) throw Error("Paid recovery invoice dates are not confirmed.");
}
async function resumePrepaid(client, e) {
  const a = e.attempt; let s = await subscription(client, e);
  const until = Math.floor(a.paidThrough.getTime() / 1000);
  if (s.metadata?.rhx_episode !== e.id) throw fail("Another recovery owns the subscription.");
  if (s.metadata.rhx_recovery_state === "completed" && s.trial_end === until
    && ["active", "trialing"].includes(s.status) && !s.pause_collection
    && s.items?.data?.length === 1 && s.items.data[0].quantity === 1 && s.items.data[0].price.id === a.priceReference) return;
  if (until <= Math.floor(Date.now() / 1000)) throw fail("The paid recovery period has ended before billing could restart.");
  // Stripe forbids pause_collection updates while fully paused. Use a zero
  // quantity before resuming instead: even an interruption cannot bill another
  // period. Quantity 1, the paid plan and its prepaid end are restored together.
  if (s.status === "paused") {
    if (s.items?.data?.length !== 1) throw fail("The paused subscription has unexpected billing items.");
    if (s.items.data[0].quantity !== 0 || s.metadata.rhx_resume_attempt !== a.id) {
      await client.subscriptions.update(s.id, {items: [{id: s.items.data[0].id, quantity: 0}],
        metadata: {rhx_resume_attempt: a.id}}, options(e, "zero-quantity-guard"));
      s = await subscription(client, e);
    }
    if (s.items.data[0].quantity !== 0 || s.metadata.rhx_resume_attempt !== a.id) throw Error("Billing restart guard is not confirmed.");
    await client.rawRequest("POST", `/v1/subscriptions/${s.id}/resume`, {billing_cycle_anchor: {type: "unchanged"},
      proration_behavior: "none", payment_behavior: "resume_on_payment_attempt"},
    {...options(e, "resume"), apiVersion: FULL_PAUSE_VERSION});
  }
  s = await subscription(client, e);
  if (!["active", "trialing"].includes(s.status) || s.items?.data?.length !== 1 || s.schedule
    || s.items.data[0].quantity !== 0 || s.metadata.rhx_resume_attempt !== a.id) throw fail("Subscription cannot resume safely.");
  const pm = await client.paymentMethods.retrieve(a.paidPaymentMethodReference);
  if (ref(pm.customer) !== e.customerReference || pm.type !== "card") throw fail("The successful card is not owned by this guardian.");
  await client.subscriptions.update(s.id, {items: [{id: s.items.data[0].id, price: a.priceReference, quantity: 1}],
    default_payment_method: pm.id, trial_end: until, proration_behavior: "none", pause_collection: "",
    metadata: {rhx_recovery_version: "2", rhx_episode: e.id, rhx_recovery_state: "completed",
      rhx_recovery_invoice: a.invoiceReference, rhx_recovery_paid_through: String(until)}}, options(e, "prepaid-period"));
  s = await subscription(client, e);
  if (s.trial_end !== until || s.pause_collection || s.items.data[0].price.id !== a.priceReference
    || s.items.data[0].quantity !== 1 || s.metadata.rhx_recovery_state !== "completed" || !["active", "trialing"].includes(s.status)) throw Error("The prepaid renewal date is not confirmed.");
}
module.exports = {ensurePaused, dropInvoice, createDraft, createPayment, payment, confirm, cancelPayment,
  settleInvoice, resumePrepaid, FULL_PAUSE_VERSION};
