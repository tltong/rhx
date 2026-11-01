const assert = require("node:assert/strict");
const {StripePayment} = require("../../stripe_payment/domain/stripe_payment");
const {GetStripeSubscriptionPaymentAction} = require("../application/get_stripe_subscription_payment_action");
const {RetryStripeSubscriptionInvoicePayment} = require("../application/retry_stripe_subscription_invoice_payment");
function fixture(mode = "test") {
  const state = {
    invoice: {id: "in_due", customer: "cus_owner", subscription: "sub_owner",
      status: "open", amount_due: 2500, amount_remaining: 2500, currency: "myr",
      collection_method: "charge_automatically", billing_reason: "subscription_cycle",
      attempted: true, confirmation_secret: {
        client_secret: "pi_due_secret_private",
      }},
    intent: {id: "pi_due", customer: "cus_owner", status: "requires_payment_method",
      client_secret: "pi_due_secret_private",
      last_payment_error: {decline_code: "insufficient_funds"}},
    subscription: {id: "sub_owner", customer: "cus_owner", status: "past_due",
      start_date: 1700000000, current_period_start: 1700000000,
      current_period_end: 1702592000, cancel_at_period_end: false,
      latest_invoice: "in_due", default_payment_method: "pm_saved",
      collection_method: "charge_automatically", payment_settings: {save_default_payment_method: "on_subscription"}},
    method: {id: "pm_saved", customer: "cus_owner", type: "card", card: {
      brand: "visa", last4: "4242", exp_month: 12, exp_year: 2030}},
    owner: true, registered: true, calls: [], charges: 0, behavior: "paid",
  };
  const attempts = new Map();
  const stripe = new StripePayment({
    customers: {create() {throw Error("Must not create customer");}, del() {}},
    subscriptions: {async retrieve(id) {
      state.calls.push(["subscription", id]); return structuredClone(state.subscription);
    }},
    invoices: {
      async retrieve(id) {
        state.calls.push(["invoice", id]);
        if (state.readFailure) throw Error("Network failed");
        return structuredClone(state.invoice);
      },
      async pay(id, params, options) {
        state.calls.push(["pay", id, params, options]);
        const key = options.idempotencyKey;
        const previous = attempts.get(key);
        if (previous) {
          assert.deepEqual(previous.params, params, "Stripe rejects changed idempotency parameters");
          return previous.promise;
        }
        const promise = (async () => {
          if (state.gate) await state.gate;
          if (state.invoice.status === "paid") {
            throw Object.assign(Error("already paid"), {code: "invoice_already_paid"});
          }
          state.charges++;
          if (state.behavior === "declined") {
            throw Object.assign(Error("sensitive raw Stripe details"), {
              type: "StripeCardError", decline_code: "insufficient_funds",
            });
          }
          if (state.behavior === "authentication") {
            state.intent.status = "requires_action";
            throw Object.assign(Error("authenticate"), {type: "StripeCardError"});
          }
          state.invoice.status = "paid";
          state.invoice.amount_remaining = 0;
          state.intent.status = "succeeded";
          state.subscription.status = "active";
          if (state.behavior === "lost-response") throw Error("socket closed");
          if (state.behavior === "read-failure") state.readFailure = true;
          return structuredClone(state.invoice);
        })();
        attempts.set(key, {params: structuredClone(params), promise});
        return promise;
      },
    },
    paymentIntents: {async retrieve() {return structuredClone(state.intent);}},
    paymentMethods: {async retrieve(id) {
      state.calls.push(["method", id]); return structuredClone(state.method);
    }},
  });
  const dependencies = {
    async createPaymentProviderContext() {return {providerName: "stripe", mode, paymentProvider: stripe};},
    async getCustomerRecordByInternalReference() {
      return state.owner ? {customerReference: "cus_owner"} : null;
    },
    async getSubscriptionRecord() {
      return state.registered ? {studentId: "student-a", planId: "monthly",
        latestInvoiceReference: "in_stale", paymentMethodReference: "pm_stale"} : null;
    },
  };
  return {state, stripe, dependencies, get: new GetStripeSubscriptionPaymentAction(dependencies),
    retry: new RetryStripeSubscriptionInvoicePayment(dependencies)};
}

module.exports = {fixture};
