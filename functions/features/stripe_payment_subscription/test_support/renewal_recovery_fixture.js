const {PaymentConfig} = require("../../payment/domain/payment_config");
const {makeRenewalRetryFixture} = require("./renewal_retry_fixture");
const {FirestoreRenewalRecoveryRepository} = require("../../syllabus_subscription/infrastructure/firestore_renewal_recovery_repository");
const {FirestoreStudentSubscriptionRepository} = require("../../syllabus_subscription/infrastructure/firestore_student_subscription_repository");
const {ReconcileRenewalRecovery} = require("../application/reconcile_renewal_recovery");

async function makeRecoveryFixture({mode = "prod", maxRetries = 3, intervalHours = 1, gracePeriodHours = 6} = {}) {
  const f = await makeRenewalRetryFixture({mode, maxRetries, intervalHours});
  f.policy.gracePeriodHours = gracePeriodHours;
  const repository = new FirestoreRenewalRecoveryRepository({...f.memory.dependencies, now: () => f.now});
  const students = new FirestoreStudentSubscriptionRepository(f.memory.dependencies);
  const dependencies = {...f.dependencies,
    getPaymentConfig: async () => new PaymentConfig({provider: "stripe", mode, renewalRetryPolicy: f.policy}),
    getInvoiceRecord: input => f.billing.getInvoiceRecord(input),
    getStudentSubscription: id => students.getSubscription(id),
    listDueRenewalRecoveries: input => repository.listDueRenewalRecoveries(input),
    claimRenewalRecovery: input => repository.claimRenewalRecovery(input),
    finishRenewalRecovery: input => repository.finishRenewalRecovery(input)};
  const controller = new ReconcileRenewalRecovery(dependencies);
  const reconcile = input => controller.process(input);
  f.processor.reconcileRenewalRecovery = reconcile;
  f.processor.getStudentSubscription = dependencies.getStudentSubscription;
  f.processor.getInvoiceRecord = dependencies.getInvoiceRecord;
  Object.assign(f.worker.dependencies, {getStudentSubscription: dependencies.getStudentSubscription,
    reconcileRenewalRecovery: reconcile, getInvoiceRecord: dependencies.getInvoiceRecord,
    ensureRenewalRecovery: owned => controller.initializeLegacy(owned)});
  Object.assign(f.manager.dependencies, {observeRecoveredPayment: owned => controller.recordPaid(owned),
    ensureRenewalRecovery: owned => controller.initializeLegacy(owned)});
  f.pendingItems = [];
  f.stripe.stripeClient.invoiceItems = {list: async () => ({data: f.pendingItems, has_more: false})};
  f.drafts = []; f.otherOpen = []; f.subscriptionUpdates = []; f.deletedDrafts = [];
  const originalRetrieve = f.stripe.stripeClient.invoices.retrieve;
  f.stripe.stripeClient.invoices.retrieve = async (id, options) => {
    if (f.bridge?.id === id) return structuredClone(f.bridge);
    const draft = f.drafts.find(d => d.id === id);
    return draft ? structuredClone(draft) : originalRetrieve(id, options);
  };
  f.stripe.stripeClient.invoices.list = async ({status}) => ({has_more: false,
    data: structuredClone(status === "draft" ? f.drafts : f.otherOpen)});
  f.stripe.stripeClient.invoices.del = async id => {
    f.deletedDrafts.push(id); f.drafts = f.drafts.filter(d => d.id !== id); return {id, deleted: true};
  };
  const applied = new Map();
  f.stripe.stripeClient.subscriptions.update = async (id, params, options) => {
    f.subscriptionUpdates.push({id, params: structuredClone(params), key: options.idempotencyKey});
    if (applied.has(options.idempotencyKey)) return structuredClone(applied.get(options.idempotencyKey));
    if (params.trial_end && f.failRestart) throw Error("Billing reset temporarily unavailable");
    const sub = f.state.subscription;
    sub.metadata = {...sub.metadata, ...params.metadata};
    if ("pause_collection" in params) sub.pause_collection = params.pause_collection || null;
    if (params.trial_end) {
      sub.trial_end = params.trial_end; sub.billing_cycle_anchor = params.trial_end;
      sub.current_period_end = params.trial_end; sub.status = "trialing";
      if (f.makeBridge) {
        f.bridge = {...structuredClone(f.state.invoice), id: "in_bridge", status: "paid", billing_reason: "subscription_update",
          created: Math.floor(f.now.getTime() / 1000), amount_due: 0, amount_remaining: 0, amount_paid: 0,
          confirmation_secret: null, payments: {data: []}, status_transitions: {paid_at: Math.floor(f.now.getTime() / 1000)}};
        sub.latest_invoice = f.bridge.id;
      }
    }
    const result = structuredClone(sub); applied.set(options.idempotencyKey, result);
    if (params.trial_end && f.loseRestartResponse) {f.loseRestartResponse = false; throw Error("Response lost after billing reset");}
    return result;
  };
  return Object.assign(f, {controller, recoveryRepository: repository, recoveryDependencies: dependencies,
    recovery: async () => (await f.read("in_renewal"))?.renewalRecovery,
    addDraft(id = "in_held_draft") {
      const draft = {...structuredClone(f.state.invoice), id, status: "draft", auto_advance: false,
        created: Math.floor(f.now.getTime() / 1000), billing_reason: "subscription_cycle"};
      f.drafts.push(draft); f.state.subscription.latest_invoice = id; return draft;
    }});
}
module.exports = {makeRecoveryFixture};
