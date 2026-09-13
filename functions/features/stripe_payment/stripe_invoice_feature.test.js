const assert = require("node:assert/strict");
const test = require("node:test");

const {
  StripePayment,
} = require("./domain/stripe_payment");

function stripeClient(overrides = {}) {
  return {
    customers: {
      async create() {
        return {id: "cus_unused"};
      },
      async del() {
        return {id: "cus_unused", deleted: true};
      },
    },
    ...overrides,
  };
}

test("StripePayment retrieves current Invoice payment context", async () => {
  const calls = [];
  const payment = new StripePayment(stripeClient({
    invoices: {
      async retrieve(reference, input) {
        calls.push(["invoice", reference, input]);
        return {
          id: "in_123",
          customer: {id: "cus_123"},
          status: "open",
          amount_due: 4500,
          currency: "MYR",
          parent: {
            type: "subscription_details",
            subscription_details: {
              subscription: {id: "sub_123"},
            },
          },
          confirmation_secret: {
            client_secret: "pi_123_secret_invoice",
          },
          payments: {
            data: [{
              is_default: true,
              payment: {
                type: "payment_intent",
                payment_intent: {id: "pi_123"},
              },
            }],
          },
        };
      },
    },
    paymentIntents: {
      async retrieve(reference) {
        calls.push(["payment-intent", reference]);
        return {
          id: "pi_123",
          customer: "cus_123",
          status: "requires_action",
          client_secret: "pi_123_secret_current",
        };
      },
    },
  }));

  const result = await payment.retrieveInvoicePaymentContext("in_123");

  assert.deepEqual(calls, [
    ["invoice", "in_123", {
      expand: [
        "confirmation_secret",
        "payments.data.payment.payment_intent",
      ],
    }],
    ["payment-intent", "pi_123"],
  ]);
  assert.deepEqual(result, {
    invoiceReference: "in_123",
    customerReference: "cus_123",
    subscriptionReference: "sub_123",
    invoiceStatus: "open",
    paymentIntentReference: "pi_123",
    paymentStatus: "requires_action",
    paymentClientSecret: "pi_123_secret_current",
    amountDue: 4500,
    currency: "myr",
  });
});

test("StripePayment does not return a secret for completed payment", async () => {
  const payment = new StripePayment(stripeClient({
    invoices: {
      async retrieve() {
        return {
          id: "in_paid",
          customer: "cus_paid",
          status: "paid",
          amount_due: 1200,
          currency: "usd",
          subscription: "sub_paid",
          confirmation_secret: {
            client_secret: "pi_paid_secret_value",
          },
        };
      },
    },
    paymentIntents: {
      async retrieve(reference) {
        return {
          id: reference,
          customer: "cus_paid",
          status: "succeeded",
          client_secret: "pi_paid_secret_value",
        };
      },
    },
  }));

  const result = await payment.retrieveInvoicePaymentContext("in_paid");

  assert.equal(result.paymentIntentReference, "pi_paid");
  assert.equal(result.paymentStatus, "succeeded");
  assert.equal(result.paymentClientSecret, null);
});

test("StripePayment supports a paid Invoice without a PaymentIntent", async () => {
  const payment = new StripePayment(stripeClient({
    invoices: {
      async retrieve() {
        return {
          id: "in_out_of_band",
          customer: "cus_123",
          status: "paid",
          amount_due: 0,
          currency: "myr",
          parent: {
            subscription_details: {
              subscription: "sub_123",
            },
          },
        };
      },
    },
  }));

  const result = await payment.retrieveInvoicePaymentContext(
    "in_out_of_band",
  );

  assert.equal(result.invoiceStatus, "paid");
  assert.equal(result.paymentIntentReference, null);
  assert.equal(result.paymentStatus, null);
  assert.equal(result.paymentClientSecret, null);
});

test("StripePayment validates Invoice ownership results", async () => {
  const payment = new StripePayment(stripeClient({
    invoices: {
      async retrieve() {
        return {
          id: "in_unexpected",
          customer: "cus_123",
          status: "open",
          amount_due: 1200,
          currency: "myr",
        };
      },
    },
  }));

  await assert.rejects(
    () => payment.retrieveInvoicePaymentContext(" "),
    /invoiceReference is required/,
  );
  await assert.rejects(
    () => payment.retrieveInvoicePaymentContext("in_expected"),
    /unexpected Invoice reference/,
  );
});
