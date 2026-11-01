# Guardian student selection and subscription plans

New failed renewals use [version 2 recovery](RENEWAL_RETRIES.md). It fully pauses billing, replaces unpaid invoices, and allows the current or a new plan when paying. Original-invoice retry details below describe the legacy path. Initial checkout and healthy next-renewal plan changes retain their existing flow.


The guardian management page can open without a subscription reference:

```text
/features/stripe_payment/pages/guardian/manage_subscription_payment.html
/features/stripe_payment/pages/guardian/manage_subscription_payment.html?studentId=...
```

Existing subscription/invoice links and the retry-page alias remain supported.
The dashboard now links every current linked student, including students with no
Stripe subscription. The dropdown lists only active guardian–student links with
available profiles. Switching students reloads a clean student URL, clears the
previous invoice/return context, and preserves separately scoped attempt state for each guardian, student and payment mode.
Account changes discard outstanding page responses and dispose secure forms.

## Existing subscriptions

The backend resolves the selected student's owned subscription, including an
incomplete initial checkout not yet linked to the application subscription.
The page displays its current plan and existing payment/card controls. Expired or
canceled subscriptions can start a replacement; existing active, overdue or
incomplete subscriptions cannot be duplicated. Another guardian's billing
subscription is not exposed or replaced.

Changing plans uses the same Stripe subscription and takes effect at the next
renewal. The page shows the new price, interval and effective date before the
guardian acts. The current paid period and access remain unchanged, and no invoice
payment is submitted. A Stripe Subscription Schedule keeps the current phase and
adds the new price/interval for the next phase, then releases back to the ordinary
subscription with that price. Payment must be resolved first. Verified prepaid
recovery bridges preserve their trial end before the new plan starts.

The provider verifies current paid invoices, collection mode, price, period and
schedule ownership. Simple single-item licensed subscriptions are supported;
discounted, metered, multi-item, incompatible-currency or unrelated scheduled billing requires support
review. Changes within a minute of the renewal boundary are rejected. Plan-update
leases and provider idempotency keys serialize requests and reconcile lost
responses. A new change intent can return to an earlier plan without replaying
that plan's old provider response; an uncertain change retains its original key.
Refresh can acknowledge an already-applied provider change through reads before
allowing another selection. An unconfirmed change is displayed as pending, not as successful.

The Stripe customer feature stores append-only price/plan versions and pending
schedule metadata alongside the existing registered subscription. Versions are
selected using the verified invoice price and period, so future renewals use the
new plan's term while old invoices retain their original plan. Concurrent old
registration projections preserve these fields transactionally. Changes to a
saved card also update the owned schedule's remaining phases. If the first renewal
under the new plan fails, recovery releases only the applied app-owned schedule,
retains its current new price, and follows the configured grace/retry policy.

## Creating a subscription

Plans come from the existing subscription feature's country-specific catalog.
The backend derives the country from the linked student's profile and reads
amount/currency/interval from the plan feature. A mode-specific quote fingerprint binds the
displayed price to preparation and creation; changed prices require a refresh.
The browser cannot submit its own amount or customer identity to these APIs.

The guardian can reuse a nonexpired saved card from their existing subscriptions
or confirm a new card using a card-only off-session SetupIntent. Its metadata
binds guardian, student, plan, quote and mode. The backend independently verifies
success, ownership and age. Setup alone makes no invoice payment. A guardian's
existing customer is reused for siblings; test/production remain separate.

Creation invokes the existing subscription creation feature, ledger initializer
and initial confirmation page. Opening a fresh page, selecting students/plans, or
mounting a form does not create a subscription. A matching, previously authorized
checkout can resume after a bank return or refresh. Only the explicit create action
starts checkout. Subscription creation can require the existing bank-authentication
step. It is not reported as paid merely because creation returned successfully.

The subscription feature owns a server-only reservation at
`subscriptions/{studentId}/checkouts/stripe_{mode}`. It snapshots customer, card,
plan terms and a student-scoped provider key. Concurrent or repeated requests
reuse one reservation; conflicting owners/details are rejected. Existing provider
results are saved before registration, retrieved rather than recreated on replay,
and can repair an interrupted registration during a later lookup. Unrecorded
unknown outcomes beyond 23 hours require review rather than an unsafe new charge.
Client writes and reads of this reservation are denied by the proposed rules.

## Feature APIs and release

The Web `stripe_payment_subscription` feature exports:

- `getStripeGuardianSubscriptionOptions({studentId?, subscriptionReference?})`
- `prepareStripeStudentSubscription({studentId, planId, quoteReference, idempotencyReference})`
- `createStripeStudentSubscription({studentId, planId, quoteReference, idempotencyReference, setupIntentReference? | savedCardReference?})`
- `changeStripeStudentSubscriptionPlan({studentId, planId, quoteReference, idempotencyReference})`

These are four new authenticated Firebase callables of the same names. Thin
handlers derive the guardian from Firebase Auth. Orchestration stays in the
backend subscription feature; Stripe SDK calls stay in `stripe_payment`, customer
reuse in `stripe_payment_customer`, registration in `stripe_customer`, and plan,
access, checkout reservation and invoice state in `syllabus_subscription`.
The page uses `stripe_payment` only for secure card entry and authentication.

Deploy the four new callables, the existing subscription creation/management
functions, both webhooks, `retryStripeRenewals`, the coordinated billing rules,
and Hosting with the shared modules. No additional index or scheduler is needed
for student selection, checkout reservations or plan changes. The pending renewal
recovery release still requires its previously added collection-group index.
These changes have not been deployed by this task.

Tests use fake Stripe clients, an isolated Firestore emulator and local Chromium.
No real subscription, payment or schedule is changed. Stripe test-mode checks of
actual Subscription Schedule phases, card setup, initial confirmation and webhook
delivery remain required release verification.
