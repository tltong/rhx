const {fixture} = require("./guardian_subscription_fixture");
const {FirestoreSubscriptionPlanChangeRepository} = require("../../stripe_customer/infrastructure/firestore_subscription_plan_change_repository");
const clone = value => structuredClone(value);
async function planFixture() {
  const f = await fixture({registered: true});
  f.state.subscription.items = {data: [{id: "si_one", quantity: 1, price: {id: "price_monthly", recurring: {usage_type: "licensed"}}}]};
  f.state.invoice.lines.data[0].pricing = {price_details: {price: "price_monthly"}};
  f.pay(); await f.process(f.event("invoice.paid"));
  f.terms = {monthly: f.billingTerms, annual: {...f.billingTerms, stripeProductName: "Annual", amount: 24000, intervalCount: 12}};
  f.dependencies.listSubscriptionPlanChoices = async () => Object.entries(f.terms).map(([planId, terms]) =>
    ({planId, name: terms.stripeProductName, months: terms.intervalCount, ...terms}));
  f.dependencies.getSubscriptionPlanBillingTerms = async ({planId}) => f.terms[planId];
  f.stripe.stripeClient.prices.list = async ({lookup_keys}) => ({data: [{id: lookup_keys[0].includes("-month-12-") ? "price_annual" : "price_monthly"}]});
  f.stripe.stripeClient.invoices.list = async () => ({data: f.openInvoices || [], has_more: false});
  const repository = new FirestoreSubscriptionPlanChangeRepository({...f.memory.dependencies, now: () => f.now});
  f.dependencies.claimSubscriptionPlanChange = input => repository.claim(input);
  f.dependencies.finishSubscriptionPlanChange = input => repository.finish(input);
  f.planCalls = [];
  const responses = new Map(), creates = new Map(); f.scheduleCreates = 0;
  f.stripe.stripeClient.subscriptionSchedules = {
    async create(input, options) {
      f.planCalls.push({action: "create", input: clone(input)});
      if (creates.has(options.idempotencyKey)) return clone(creates.get(options.idempotencyKey));
      f.scheduleCreates++;
      f.schedule = {id: "sub_sched_one", status: "active", subscription: "sub_one", metadata: input.metadata,
        phases: [{start_date: f.state.subscription.current_period_start, end_date: f.state.subscription.current_period_end,
          items: [{price: "price_monthly", quantity: 1}], default_payment_method: "pm_one", metadata: {},
          ...(f.state.subscription.trial_end ? {trial_end: f.state.subscription.trial_end} : {})}]};
      f.state.subscription.schedule = f.schedule.id;
      creates.set(options.idempotencyKey, clone(f.schedule));
      if (f.losePlanCreationResponse) {f.losePlanCreationResponse = false; throw Error("Schedule migration response lost");}
      return clone(f.schedule);
    },
    retrieve: async () => clone(f.schedule),
    async update(id, input, options) {
      f.planCalls.push({action: "update", input: clone(input)});
      if (responses.has(options.idempotencyKey)) return clone(responses.get(options.idempotencyKey));
      f.schedule.metadata = {...f.schedule.metadata, ...input.metadata};
      if (input.default_settings) f.schedule.default_settings = clone(input.default_settings);
      if (input.phases) f.schedule.phases = input.phases.map(phase => {
        const result = clone(phase);
        if (result.duration) {
          const end = new Date(result.start_date * 1000); end.setUTCMonth(end.getUTCMonth() + result.duration.interval_count);
          result.end_date = +end / 1000; delete result.duration;
        }
        return result;
      });
      responses.set(options.idempotencyKey, clone(f.schedule));
      if (f.losePlanResponse) {f.losePlanResponse = false; throw Error("Response lost after future plan applied");}
      return clone(f.schedule);
    },
    async release(id) {f.planCalls.push({action: "release", id}); f.state.subscription.schedule = null; return {...clone(f.schedule), status: "released"};},
  };
  f.stripe.stripeClient.subscriptions.update = async (id, input) => {
    if (input.default_payment_method) f.state.subscription.default_payment_method = input.default_payment_method;
    if (input.metadata) f.state.subscription.metadata = {...f.state.subscription.metadata, ...input.metadata};
    if ("pause_collection" in input) f.state.subscription.pause_collection = input.pause_collection || null;
    return clone(f.state.subscription);
  };
  f.planInput = async planId => ({...f.base, planId, idempotencyReference: "plan-change",
    quoteReference: (await f.manager.options(f.base)).plans.find(plan => plan.planId === planId).quoteReference});
  return f;
}
module.exports = {planFixture};
