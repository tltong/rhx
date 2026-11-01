# Guardian subscription payments

New failed renewals use [version 2 recovery](../../../functions/features/stripe_payment_subscription/RENEWAL_RETRIES.md). It fully pauses billing, replaces unpaid invoices, and allows the current or a new plan when paying. Original-invoice retry details below describe the legacy path. Initial checkout and healthy next-renewal plan changes retain their existing flow.


The guardian dashboard links every current linked student to management. The page
can open with no parameters, with `studentId`, or with an existing subscription:

```text
/features/stripe_payment/pages/guardian/manage_subscription_payment.html?subscriptionReference=sub_...
```

An optional `invoiceReference=in_...` identifies a renewal link. The previous
`retry_subscription_payment.html` entry point opens the same management flow.
The original complete-payment page retains its initial checkout/authentication role.
For an incomplete first subscription with an open invoice and a `requires_confirmation`
PaymentIntent, the backend verifies that the attached card is the owned saved card.
The page then shows **Pay** with the amount. Its explicit click uses
`confirmSubscriptionPayment({paymentClientSecret, returnUrl, useSavedCard: true})`,
which calls Stripe.js `confirmCardPayment` and handles any bank authentication.
An already-confirmed `requires_action` payment uses `authenticationOnly: true`.
Loading or checking the page never confirms a payment; completion is shown only
after the backend reports the invoice as paid.
Only student, subscription and invoice references belong in links; never include customer
IDs, amounts, mode, card details or client secrets.

## Page behavior and failure indication

The page queries `stripe_payment_subscription` for subscription and invoice data.
That feature calls the authenticated backend subscription API, which verifies the
guardian's ownership and checks Stripe's current state. It displays the default
card and lets eligible guardians change it for future charges, including when all
payments are healthy. A renewal section appears when the latest invoice is a
subscription renewal (`billing_reason: subscription_cycle`).

The billing notice distinguishes:

- **Renewal payment failed:** red notice with amount remaining and a safe bank
  reason such as insufficient funds. A confirmed prior attempt/error or an overdue
  subscription establishes failure; a fetch error alone does not.
- **Bank authentication required:** amber notice and a secure authentication action.
- **Payment processing:** pending notice with payment buttons disabled.
- **Payment complete / Payments up to date:** only after the invoice is confirmed paid.
- **Renewal unpaid / Status unavailable:** separate states, without claiming success.

The renewal panel shows invoice reference, balance, card selected for the retry,
next automatic retry when supplied by Stripe, and last checked time. An outdated
invoice link displays the latest renewal but disables its payment actions until the
guardian explicitly opens the current invoice. Loading or refreshing never initiates
an invoice payment. Sign-in opens in another tab and keeps the original link.

A rejected lookup has its own notice. Missing or inaccessible subscriptions show
**Subscription unavailable**, with dashboard/new-checkout guidance; network errors
show **Payment service unavailable**, and expired sign-in shows the sign-in panel.
A safe support code appears at the bottom without exposing raw provider errors.
Old student links can remain after a Stripe test customer is deleted and its
subscription is canceled. Such links cannot manage a replacement customer or
restart a canceled subscription; they require a current subscription from checkout.

## Feature APIs

Subscription queries and actions go through the public Web
`stripe_payment_subscription/stripe_payment_subscription_module.js`. Its gateway
calls the existing Firebase endpoints, which invoke the backend
`stripe_payment_subscription` feature. Only that backend reaches Stripe's server
API. The page never retrieves subscriptions or invoices using Stripe.js or direct
Stripe HTTP requests.

The subscription feature owns:

- `getStripeSubscriptionPaymentDetails({subscriptionReference, invoiceReference?})`
  calls the authenticated backend and returns `{subscriptionReference,
  subscriptionStatus, currentCard, canChangeCard, paymentState, renewal,
  nextChargeAt, linkedInvoiceIsCurrent, studentId, planId, cancelAtPeriodEnd}`.
- `createStripeSubscriptionCardSetup({subscriptionReference, idempotencyReference})` returns
  `{setupIntentReference, clientSecret}` for an owned subscription card update.
  It uses the existing `createStripeSetupIntent` callable's subscription-bound
  path. No new HTTP endpoint is required.
- `updateStripeSubscriptionPaymentMethod({subscriptionReference,
  setupIntentReference})` verifies the successful SetupIntent on the server and
  updates this subscription's default payment method. It returns refreshed details.
- `getStripeSubscriptionPaymentAction({subscriptionReference, invoiceReference,
  paymentMethodChoice: "new_card"})` prepares eligible card entry against the existing
  invoice PaymentIntent and returns an `enter_new_card` action and its client secret.
  Ordinary lookups retain the existing string/object contracts and do not expose
  a card-entry secret. Secrets for required authentication remain supported.
- `retryStripeSubscriptionPayment({subscriptionReference, invoiceReference,
  idempotencyReference})` retries the invoice with the server-selected current card.

The existing Web `stripe_payment` feature owns secure card entry and confirmation:

- `mountSetupPaymentElement({clientSecret, containerSelector})` reuses existing
  mounting support for SetupIntents and invoice PaymentIntents.
- `confirmSetup({contextReference, returnUrl})` confirms future-card setup.
- `confirmSubscriptionPayment({contextReference, returnUrl})` submits the mounted
  new card to the existing invoice PaymentIntent, including required 3DS.
- `confirmSubscriptionPayment({paymentClientSecret, returnUrl,
  authenticationOnly: true})` handles the next action for a server-confirmed
  saved-card payment. Existing checkout secret-based confirmation remains valid.
- `disposePaymentElement({contextReference})` releases a form on cancel/sign-out.

Existing checkout and admin imports from `stripe_payment` remain compatible;
subscription management exports delegate to the subscription feature. Its original
customer-string `createStripeSetupIntent` contract is retained.

## Three distinct actions

Backend automatic renewal retries, configuration, Active/Suspended application
status and their deployment requirements are documented in
`functions/features/stripe_payment_subscription/RENEWAL_RETRIES.md`. Student
learning access expires at the configured grace deadline. Verified recovered
payment starts a new full paid period and moves the next Stripe charge to its end.

**Change card for future payments:** create a subscription-bound, card-only
SetupIntent for off-session usage; mount and confirm it; then call the backend to
set the default. The backend checks the authenticated owner, customer, subscription,
mode, setup purpose, successful status, usage, attached card ownership and setup
age. It never trusts the browser's claim that setup succeeded. A SetupIntent alone
is not sufficient to change the subscription default. The update never calls
`invoices.pay` or confirms an invoice PaymentIntent. The backend renewal retry policy and any active recovery hold still apply.

**Retry with the current card:** the backend validates the current open renewal
invoice and chooses the live subscription default, falling back to the invoice's
saved method if needed. This allows a separately saved replacement card to be used
on a later explicit retry even when an older invoice has a card override. It calls
`StripePayment.payInvoice`, wrapping `invoices.pay` with `off_session: false` and a
caller/mode/invoice-scoped idempotency key. Paid, processing and authentication-required
invoices are not resubmitted. After any Stripe response/error the backend rechecks
authoritative state. Unknown outcomes retain the browser's attempt reference across
reloads and require a status check before another attempt.

**Pay the renewal with a new card:** explicitly prepare the owned renewal payment
context, mount the invoice PaymentIntent, and confirm the new card. It does not
create another customer, subscription, invoice or separate SetupIntent. Existing
`save_default_payment_method: on_subscription` configuration saves the successful
card for future renewals. Payment confirmation is followed by a backend status
check; a redirect parameter or browser result alone never establishes payment.

The signed invoice webhooks now persist initial and recurring billing state in the
existing student subscription feature. Paid events create idempotent receipts and
apply verified invoice-line coverage for normal payments. Failed-renewal recovery
uses the verified paid timestamp and billing reset described in RENEWAL_RETRIES.md.
They also record the current card's masked metadata. Original checkout identity is
retained so card changes do not break idempotent creation retries. Billing dates
are retained.

## Recovery and storage

The browser stores opaque attempt/SetupIntent references and progress stages only,
scoped to guardian UID and subscription. It stores no card details or client secrets.
Bank returns have secrets removed from the URL immediately. A completed SetupIntent
is applied after a return only when it matches the previously authorized save in
this browser. The backend independently verifies it again.

Card-update idempotency is bound to the SetupIntent, not a client-selected replacement
card reference. New applications of setups older than 23 hours are rejected, keeping
replays inside Stripe's idempotency retention window. Uncertain saves can be finished
without collecting the card again. Account changes discard pending UI responses and
release mounted contexts.

## Release and validation

Deploy the new `getStripeSubscriptionPaymentDetails` and
`updateStripeSubscriptionPaymentMethod` functions, and updated
`createStripeSetupIntent`, `getStripeSubscriptionPaymentAction`,
`retryStripeSubscriptionPayment`, `stripeTestWebhook` and `stripeProdWebhook`,
then Hosting. The existing subscription schema gains a billing summary, invoices and processed
events. The full renewal recovery release also requires collection-group retry/recovery
indexes, the existing five-minute worker and billing access rules. No minimum
warm instance is introduced. The full pending release also updates `createStripeSubscription` for
initial invoice initialization. See the backend subscription billing documentation
for required Stripe event selections and failure processing.

Tests cover live-state classification with fake Stripe clients, ownership checks,
future-only card updates without charges, new-card invoice contexts, failed and
repeated requests, confirmation gateways, desktop/mobile behavior, bank returns,
account changes and the separate original checkout page. They make no real charges.
Stripe test-mode validation of actual card setup, 3DS and webhook delivery remains
part of release verification.

## Student selection and subscription plans

The management page now lets guardians select a current linked student. Existing
subscriptions show their plan and payment tools; eligible paid subscriptions can
change plans at the next renewal. Students without a current subscription can
choose an available plan and use a saved or new card for checkout. See
[STUDENT_SUBSCRIPTIONS.md](../../../functions/features/stripe_payment_subscription/STUDENT_SUBSCRIPTIONS.md)
for ownership, quote validation, duplicate prevention, schedule/card interactions
and the four new authenticated backend APIs required for deployment.
