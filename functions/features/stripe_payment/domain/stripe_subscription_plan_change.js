const {key} = require("./stripe_subscription_card");
const ref = value => typeof value === "object" ? value?.id : value;
function fail(message) {return Object.assign(Error(message), {code: "failed-precondition"});}
function period(sub) {
  const item = sub.items?.data?.[0];
  return {start: sub.current_period_start || item?.current_period_start, end: sub.current_period_end || item?.current_period_end};
}
function price(sub) {return ref(sub.items?.data?.[0]?.price || sub.items?.data?.[0]?.plan);}
function ours(schedule, sub) {return schedule.metadata?.rhx_plan_change === "1"
  && schedule.metadata.rhx_subscription === sub.id && ref(schedule.subscription) === sub.id;}
function phaseParameters(phase) {
  const result = {items: phase.items.map(item => ({price: ref(item.price || item.plan), quantity: item.quantity || 1})),
    start_date: phase.start_date, end_date: phase.end_date, proration_behavior: "none"};
  for (const field of ["collection_method", "default_payment_method", "default_tax_rates", "description", "invoice_settings",
    "application_fee_percent", "on_behalf_of", "transfer_data", "automatic_tax", "metadata", "billing_thresholds", "billing_cycle_anchor", "trial_end"]) {
    if (phase[field] != null) result[field] = field === "default_payment_method" || field === "on_behalf_of"
      ? ref(phase[field]) : field === "default_tax_rates" ? phase[field].map(ref) : phase[field];
  }
  return result;
}
async function scheduleStripePlanChange(client, input) {
  const sub = await client.subscriptions.retrieve(input.subscriptionReference), now = Math.floor(+input.now / 1000);
  const {start, end} = period(sub), item = sub.items?.data?.[0];
  const paidBridge = sub.status === "trialing" && sub.metadata?.rhx_recovery_version === "1" && sub.metadata.rhx_recovery_state === "completed";
  if (sub.id !== input.subscriptionReference || (sub.status !== "active" && !paidBridge) || sub.cancel_at_period_end || sub.pause_collection
    || sub.pending_update || sub.collection_method !== "charge_automatically" || sub.items?.data?.length !== 1
    || !ref(sub.default_payment_method)
    || (item.quantity || 1) !== 1 || item.price?.recurring?.usage_type === "metered"
    || sub.discount || sub.discounts?.length || sub.pending_invoice_item_interval
    || end !== Math.floor(+input.effectiveAt / 1000) || end <= now + 60 || price(sub) !== input.currentPriceReference) {
    throw fail("Resolve payment or contact support before changing this subscription plan.");
  }
  const latest = await client.invoices.retrieve(ref(sub.latest_invoice));
  const open = await client.invoices.list({subscription: sub.id, status: "open", limit: 100});
  if (latest.status !== "paid" || latest.amount_remaining !== 0 || open.has_more
    || open.data.some(invoice => invoice.amount_remaining > 0)) throw fail("Resolve unpaid invoices before changing plans.");
  let schedule;
  const createSchedule = () => client.subscriptionSchedules.create({from_subscription: sub.id},
    {idempotencyKey: key("student-plan-schedule-", [sub.id, end])});
  if (sub.schedule) {
    schedule = await client.subscriptionSchedules.retrieve(ref(sub.schedule));
    if (!ours(schedule, sub)) {
      if (!input.scheduleWasAbsent) throw fail("This subscription has a separate billing schedule that needs support review.");
      // from_subscription must be the only create parameter. A retry of our
      // exact provider key proves ownership if the first create response was
      // lost before the subsequent metadata/phase update could run.
      const created = await createSchedule();
      if (created.id !== schedule.id || ref(created.subscription) !== sub.id || schedule.phases.length !== 1) {
        throw fail("The interrupted schedule migration needs support review.");
      }
    }
  } else {
    schedule = await createSchedule();
  }
  const matches = schedule.metadata?.rhx_target_price === input.priceReference
    && schedule.metadata.rhx_target_plan === input.planId
    && Number(schedule.metadata.rhx_effective_at) === end
    && schedule.phases.some(phase => phase.start_date === end && ref(phase.items?.[0]?.price) === input.priceReference);
  if (!matches) {
    const current = schedule.phases.find(phase => phase.start_date <= now && phase.end_date > now);
    if (!current || current.items.length !== 1 || ref(current.items[0].price) !== input.currentPriceReference
      || current.discounts?.length || current.add_invoice_items?.length) throw fail("The current billing phase needs support review.");
    const first = {...phaseParameters(current), end_date: end, default_payment_method: ref(sub.default_payment_method)};
    const next = {...phaseParameters(current), start_date: end, items: [{price: input.priceReference, quantity: 1}],
      duration: {interval: input.terms.interval, interval_count: input.terms.intervalCount}, billing_cycle_anchor: "phase_start"};
    next.default_payment_method = ref(sub.default_payment_method);
    delete next.end_date; delete next.trial_end;
    await client.subscriptionSchedules.update(schedule.id, {end_behavior: "release", proration_behavior: "none",
      phases: [first, next], metadata: {rhx_plan_change: "1", rhx_subscription: sub.id,
        rhx_target_price: input.priceReference, rhx_effective_at: String(end), rhx_target_plan: input.planId}},
    {idempotencyKey: key("student-plan-change-", [sub.id, end, input.priceReference, input.planId, input.idempotencyReference])});
  }
  const verified = await client.subscriptionSchedules.retrieve(schedule.id);
  const fresh = await client.subscriptions.retrieve(sub.id);
  if (!ours(verified, fresh) || ref(fresh.schedule) !== schedule.id || period(fresh).end !== end
    || price(fresh) !== input.currentPriceReference || verified.metadata.rhx_target_price !== input.priceReference
    || !verified.phases.some(phase => phase.start_date === end && ref(phase.items?.[0]?.price) === input.priceReference)) {
    throw Error("The future plan change is not confirmed.");
  }
  return {scheduleReference: schedule.id};
}
async function confirmedStripePlanChange(client, input) {
  const sub = await client.subscriptions.retrieve(input.subscriptionReference);
  if (sub.id !== input.subscriptionReference || !sub.schedule) return null;
  const schedule = await client.subscriptionSchedules.retrieve(ref(sub.schedule));
  const end = Math.floor(+input.effectiveAt / 1000);
  return ours(schedule, sub) && schedule.metadata.rhx_target_price === input.priceReference
    && schedule.metadata.rhx_target_plan === input.planId
    && Number(schedule.metadata.rhx_effective_at) === end
    && schedule.phases.some(phase => phase.start_date === end && ref(phase.items?.[0]?.price) === input.priceReference)
    ? {scheduleReference: schedule.id} : null;
}
async function releaseAppliedPlanSchedule(client, sub) {
  if (!sub.schedule) return sub;
  if (typeof client.subscriptionSchedules?.retrieve !== "function") throw fail("The billing schedule needs support review.");
  const schedule = await client.subscriptionSchedules.retrieve(ref(sub.schedule));
  const effectiveAt = Number(schedule.metadata?.rhx_effective_at), startedAt = period(sub).start;
  if (!ours(schedule, sub) || price(sub) !== schedule.metadata.rhx_target_price
    || !Number.isSafeInteger(effectiveAt) || !Number.isSafeInteger(startedAt) || startedAt < effectiveAt) {
    throw fail("A billing schedule needs review before renewal recovery.");
  }
  await client.subscriptionSchedules.release(schedule.id, {preserve_cancel_date: true},
    {idempotencyKey: key("student-plan-release-", [sub.id, schedule.id])});
  const fresh = await client.subscriptions.retrieve(sub.id);
  if (fresh.schedule || price(fresh) !== price(sub)) throw Error("Plan schedule release is not confirmed.");
  return fresh;
}
async function updateManagedScheduleCard(client, sub, input) {
  if (!sub.schedule) return;
  const schedule = await client.subscriptionSchedules.retrieve(ref(sub.schedule));
  if (!ours(schedule, sub)) return;
  const now = Math.floor(Date.now() / 1000);
  const phases = schedule.phases.filter(phase => phase.end_date > now)
    .map(phase => ({...phaseParameters(phase), default_payment_method: input.paymentMethodReference}));
  await client.subscriptionSchedules.update(schedule.id, {default_settings: {default_payment_method: input.paymentMethodReference},
    phases, proration_behavior: "none"},
  {idempotencyKey: key("student-plan-card-", [sub.id, schedule.id, input.setupIntentReference])});
  const verified = await client.subscriptionSchedules.retrieve(schedule.id);
  if (verified.phases.some(phase => phase.end_date > now && ref(phase.default_payment_method) !== input.paymentMethodReference)) {
    throw Error("The card for future plan phases is not confirmed.");
  }
}
module.exports = {scheduleStripePlanChange, confirmedStripePlanChange, releaseAppliedPlanSchedule, updateManagedScheduleCard};
