# Subscription invoice billing

New failed renewals use [version 2 recovery](../stripe_payment_subscription/RENEWAL_RETRIES.md). It fully pauses billing, replaces unpaid invoices, and allows the current or a new plan when paying. Original-invoice retry details below describe the legacy path. Initial checkout and healthy next-renewal plan changes retain their existing flow.


Application billing state is owned by `syllabus_subscription` and defined in the
existing `functions/schema/subscription_schema.js`. The browser schema mirrors it.
Stripe customer records remain the customer/checkout-registration and saved-card
integration store; their old latest-invoice fields are not the application ledger.
No data migration or relocation of existing customer/subscription documents is needed.

## Flow and schema

```text
Stripe POST → existing test/prod webhook → signature verification
  → stripe_payment_subscription.processStripeSubscriptionEvent({mode, event})
      → resolve registered checkout/customer ownership
      → stripe_payment retrieves current subscription, invoice and PaymentIntent
      → normalize initial/renewal status and paid invoice-line coverage
  → syllabus_subscription.recordInvoicePaymentEvent(...)
      → one Firestore transaction for history, event marker, receipt and access
```

The existing student subscription document remains `subscriptions/{studentId}`.
New additive records are:

- `billingSummary`: current provider/mode/subscription context, invoice reference,
  billing reason, raw and normalized states, remaining balance, failure and retry data.
- `invoices/{provider_mode_subscriptionHash_invoiceHash}`: one initial/renewal invoice
  per billing subscription, including amount due/paid/remaining in minor units,
  currency exponent, creation/observation timestamps, paid coverage, attempt count,
  safe failure code, retry time, and paid/access-applied timestamps.
- `billingEvents/{provider_mode_eventHash}`: processed event identity and time;
  raw Stripe payloads and client secrets are never stored.
- Existing `payments/{scopedInvoiceKey}`: deterministic successful receipts, retaining
  the existing receipt shape and major-currency `amountPaid`, with provider mode and
  subscription reference added. Legacy auto-ID receipts stay compatible.

Invoice/event keys isolate test and production and support document-ID pagination
without a new composite index. Receipt readers exclude the other mode while
retaining legacy receipts. Ordinary subscription saves merge their entitlement
fields and preserve the server-written billing summary.

## Internal backend APIs

Exported by `subscription_billing_module.js` in the existing subscription feature:

```javascript
// scope = {studentId, paymentProvider, paymentMode, paymentSubscriptionReference}
initializeInvoiceRecord({...scope, invoiceRecord})
getInvoiceRecord({...scope, invoiceReference})
listInvoiceRecords({...scope, limit?, cursor?})
recordInvoicePaymentEvent({...scope, eventReference, eventType, eventCreatedAt, invoiceRecord})
```

Invoice initialization is create-only for payment state. It does not overwrite an
already-paid invoice when the webhook wins a race. The webhook write transaction
returns `duplicate`, `invoiceRecord`, `summaryUpdated`, `accessUpdated`, and
`receiptCreated`. The transaction reads all relevant documents before writing;
there are no Stripe/network calls inside it.

## Four outcomes

| Invoice kind | Current paid state | Current failed state |
| --- | --- | --- |
| `subscription_create` | Paid invoice + one receipt; establish paid linkage and coverage. | Failed initial invoice; retain trial/existing access; no paid receipt. |
| `subscription_cycle` | Normal paid renewal uses invoice coverage. Failed-renewal recovery starts a new full period at verified payment after billing reset. | Preserve paid-through date; hold later collections, retain access during grace, then suspend learning. |

`requires_action` is authentication-required, and `processing` or an unsettled
invoice with a succeeded PaymentIntent remains processing. Only an invoice whose
current status is paid and balance is zero can be recorded paid. Fully discounted
paid invoices are valid and can create zero-value receipts.

Paid coverage comes from the invoice's non-proration subscription line periods,
including paginated lines. It never uses the subscription's newer current period
as a substitute. Unsupported or ambiguous coverage remains in invoice history but
does not create a duration receipt or grant unverified access.

## Duplicate, stale and mode safeguards

A processed event is committed atomically with its invoice and effects. Repeated
or concurrent delivery cannot duplicate a receipt or extend access again. Paid
invoice state cannot regress to failed; older observed snapshots/attempt counts
cannot replace newer progress. Old invoice history can update without replacing
the current invoice summary. Older billing subscriptions cannot replace a newer
subscription context, and paid-through dates are never shortened by old invoices.

Test events cannot alter an existing production summary or entitlement. Promoting
a test subscription to a real paid production subscription uses the real paid
coverage rather than carrying over an artificial test expiry. Explicit provider/
mode context comes from the verified webhook endpoint, never a mutable global
payment-mode setting.

The existing customer saved-card metadata projection follows a committed paid
invoice. If that projection fails, the webhook returns 500; redelivery retries it
while the financial event remains deduplicated.

## Supported events and release

Both existing webhook endpoints route invoice/subscription events directly to the
subscription processor and SetupIntent events to their existing customer setup
processor. Unsupported event types are acknowledged without applying billing data.
Enable these events on both the Stripe test and production endpoint configurations:

- `invoice.paid`
- `invoice.payment_failed`
- `invoice.payment_action_required`
- `invoice.updated` (including retry scheduling from Stripe Automations)
- `customer.subscription.updated`
- `customer.subscription.deleted`

Deploy `createStripeSubscription`, `stripeTestWebhook`, and `stripeProdWebhook` with
the shared feature/schema changes. Deploy the companion guardian payment callables
and Hosting changes described in `public/features/stripe_payment/SAVED_CARD_RETRY.md`
when releasing the full pending payment-management work. No new webhook endpoint,
secret, scheduled task or minimum warm instance is required.

Tests include actual local Stripe webhook HMAC verification with fake Stripe data,
transaction conflicts and retries, all four outcomes in both modes, interrupted
checkout initialization, receipt/mode compatibility, and existing guardian UI flows.
They make no live Stripe API calls or charges. Deployed Stripe test-mode validation
and event-selection configuration remain release steps.

## Renewal recovery and access

Failed renewals now use server-owned `renewalRecovery` and `renewalGraceUntil` on
the existing student subscription. Invoice recovery records keep private workflow
leases and due dates. Original Stripe coverage is retained; `recoveredCoverageStart`
and `recoveredCoverageEnd` record the new paid term, with matching receipt coverage.
A receipt can exist while billing reset is pending; it alone does not restore
access. See [RENEWAL_RETRIES.md](../stripe_payment_subscription/RENEWAL_RETRIES.md)
and [BILLING_ACCESS_RULES.md](BILLING_ACCESS_RULES.md) for the state flow, provider
bridge, server enforcement, legacy adoption and coordinated release requirements.
