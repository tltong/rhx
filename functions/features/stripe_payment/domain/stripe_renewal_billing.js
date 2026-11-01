const {key} = require("./stripe_subscription_card");
const {releaseAppliedPlanSchedule} = require("./stripe_subscription_plan_change");
function ref(value) {return typeof value === "object" ? value?.id : value;}
function fail(message) {return Object.assign(new Error(message), {code: "failed-precondition"});}
function invoiceSubscription(invoice) {return ref(invoice.parent?.subscription_details?.subscription || invoice.subscription);}
function verifyInvoice(invoice, input, subscription) {
  if (invoice.id !== input.invoiceReference || invoiceSubscription(invoice) !== input.subscriptionReference
    || ref(invoice.customer) !== ref(subscription.customer) || invoice.billing_reason !== "subscription_cycle") {
    throw fail("Unexpected renewal invoice ownership.");
  }
}
function managed(subscription, invoiceReference) {
  return subscription.metadata?.rhx_recovery_invoice === invoiceReference
    && subscription.metadata?.rhx_recovery_version === "1";
}
function requireSupported(subscription) {
  if (subscription.collection_method !== "charge_automatically" || subscription.schedule || subscription.pending_update
    || subscription.pending_invoice_item_interval || subscription.billing_schedules?.length
    || subscription.items?.data?.some(item => (item.price?.recurring?.usage_type || item.plan?.usage_type) === "metered")
    || !["active", "past_due", "unpaid", "trialing"].includes(subscription.status)) throw fail("This subscription requires billing review.");
}
async function allInvoices(client, subscriptionReference, status) {
  const invoices = []; let after;
  for (let page = 0; page < 100; page++) {
    const result = await client.invoices.list({subscription: subscriptionReference, status, limit: 100,
      ...(after ? {starting_after: after} : {})});
    if (!Array.isArray(result.data)) throw Error("Invalid Stripe invoice list.");
    invoices.push(...result.data);
    if (!result.has_more) return invoices;
    const next = result.data.at(-1)?.id;
    if (!next || next === after) throw Error("Invalid Stripe invoice pagination.");
    after = next;
  }
  throw Error("Too many invoices to reconcile safely.");
}
async function holdStripeRenewalBilling(client, input) {
  let subscription = await client.subscriptions.retrieve(input.subscriptionReference);
  if (subscription.id !== input.subscriptionReference) throw fail("Unexpected Stripe subscription.");
  const invoice = await client.invoices.retrieve(input.invoiceReference);
  verifyInvoice(invoice, input, subscription);
  if (invoice.status === "paid") return {paid: true};
  if (invoice.status !== "open") throw fail("The renewal is no longer payable.");
  if (subscription.schedule) subscription = await releaseAppliedPlanSchedule(client, subscription);
  requireSupported(subscription);
  if (subscription.pause_collection && (!managed(subscription, input.invoiceReference)
    || subscription.pause_collection.behavior !== "keep_as_draft")) throw fail("Another billing hold needs review.");
  if (subscription.metadata?.rhx_recovery_state === "held" && !managed(subscription, input.invoiceReference)) {
    throw fail("Another renewal is already being recovered.");
  }
  if (invoice.auto_advance !== false) await client.invoices.update(invoice.id, {auto_advance: false});
  if (!managed(subscription, input.invoiceReference) || !subscription.pause_collection) {
    await client.subscriptions.update(subscription.id, {pause_collection: {behavior: "keep_as_draft"},
      metadata: {rhx_recovery_version: "1", rhx_recovery_invoice: invoice.id, rhx_recovery_state: "held"}},
    {idempotencyKey: key("renewal-hold-", [subscription.id, invoice.id])});
  }
  const verified = await client.subscriptions.retrieve(subscription.id);
  if (!managed(verified, invoice.id) || verified.pause_collection?.behavior !== "keep_as_draft") {
    throw Error("The Stripe billing hold is not confirmed.");
  }
  return {held: true};
}
async function restartStripeRenewalBilling(client, input) {
  let subscription = await client.subscriptions.retrieve(input.subscriptionReference);
  if (subscription.id !== input.subscriptionReference) throw fail("Unexpected Stripe subscription.");
  const invoice = await client.invoices.retrieve(input.invoiceReference);
  verifyInvoice(invoice, input, subscription);
  const paidAt = Math.floor(input.paidAt.getTime() / 1000), paidThrough = Math.floor(input.paidThrough.getTime() / 1000);
  if (invoice.status !== "paid" || invoice.amount_remaining !== 0 || invoice.status_transitions?.paid_at !== paidAt) {
    throw fail("Billing restart requires the verified invoice payment date.");
  }
  if (subscription.schedule) subscription = await releaseAppliedPlanSchedule(client, subscription);
  requireSupported(subscription);
  const completed = managed(subscription, invoice.id) && subscription.metadata.rhx_recovery_state === "completed"
    && subscription.metadata.rhx_recovery_paid_through === String(paidThrough);
  if (completed && !subscription.pause_collection
    && (subscription.trial_end === paidThrough || subscription.billing_cycle_anchor === paidThrough)) return {restarted: true};
  if (subscription.metadata?.rhx_recovery_state === "held" && !managed(subscription, invoice.id)
    || Number(subscription.metadata?.rhx_recovery_paid_at || 0) > paidAt) throw fail("A newer recovery owns this subscription.");
  if (subscription.pause_collection && !managed(subscription, invoice.id)) throw fail("An unrelated billing hold must be reviewed.");
  if (!Number.isSafeInteger(paidThrough) || paidThrough <= paidAt || paidThrough <= Math.floor((input.now || new Date()).getTime() / 1000)) {
    throw fail("The recovered paid period has already ended.");
  }
  const open = await allInvoices(client, subscription.id, "open");
  if (open.some(other => other.id !== invoice.id && other.amount_remaining > 0)) throw fail("Other unpaid invoices require billing review.");
  // A new zero-amount bridge invoice must not pick up an unrelated pending
  // customer charge. Explicitly scoped sibling items remain independent.
  if (typeof client.invoiceItems?.list !== "function") throw Error("Pending invoice item checks are unavailable.");
  let itemCursor;
  for (let page = 0; ; page++) {
    if (page >= 100) throw fail("Pending billing items require review.");
    const pending = await client.invoiceItems.list({customer: ref(subscription.customer), pending: true, limit: 100,
      ...(itemCursor ? {starting_after: itemCursor} : {})});
    if (!Array.isArray(pending.data)) throw Error("Invalid pending invoice items.");
    if (pending.data.some(item => !ref(item.subscription) || ref(item.subscription) === subscription.id)) {
      throw fail("Pending invoice items require billing review before restarting.");
    }
    if (!pending.has_more) break;
    const next = pending.data.at(-1)?.id;
    if (!next || next === itemCursor) throw Error("Invalid pending invoice item pagination.");
    itemCursor = next;
  }
  const drafts = await allInvoices(client, subscription.id, "draft");
  const generated = drafts.filter(draft => draft.billing_reason === "subscription_cycle" && draft.created >= invoice.created);
  for (const draft of generated) {
    if (invoiceSubscription(draft) !== subscription.id || ref(draft.customer) !== ref(subscription.customer)
      || draft.lines?.has_more || !draft.lines?.data?.length || draft.lines.data.some(line =>
        !(line.type === "subscription" || line.parent?.type === "subscription_item_details")
          || line.proration || line.parent?.subscription_item_details?.proration)) {
      throw fail("A draft with additional billing items needs review.");
    }
  }
  for (const draft of generated) {
    const deleted = await client.invoices.del(draft.id);
    if (deleted.id !== draft.id || !deleted.deleted) throw Error("Draft cleanup is not confirmed.");
  }
  // The invoice just paid funds this whole period. A prepaid bridge moves the
  // next charge to its end; resetting the anchor to now would charge twice.
  await client.subscriptions.update(subscription.id, {trial_end: paidThrough, proration_behavior: "none",
    pause_collection: "", metadata: {rhx_recovery_version: "1", rhx_recovery_invoice: invoice.id,
      rhx_recovery_state: "completed", rhx_recovery_paid_at: String(paidAt), rhx_recovery_paid_through: String(paidThrough)}},
  {idempotencyKey: key("renewal-restart-", [subscription.id, invoice.id, paidAt, paidThrough])});
  const verified = await client.subscriptions.retrieve(subscription.id);
  if (verified.id !== subscription.id || ref(verified.customer) !== ref(subscription.customer) || verified.pause_collection
    || verified.trial_end !== paidThrough || !managed(verified, invoice.id)
    || verified.metadata.rhx_recovery_state !== "completed" || !["active", "trialing"].includes(verified.status)) {
    throw Error("The new subscription billing date is not confirmed.");
  }
  return {restarted: true};
}
module.exports = {holdStripeRenewalBilling, restartStripeRenewalBilling};
