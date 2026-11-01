# Failed-renewal recovery (version 2)

Each student keeps one Stripe subscription. Guardians can share a customer and
card, but grace, retry counts, invoices and access are isolated per student.
Older unpaid invoices are excluded from this rollout. Refund/dispute handling is
outside this change. Legacy jobs retain their existing behavior; there is no bulk
cleanup, migration or new enrollment of legacy retry records.

## Policy

The payment feature owns `paymentConfigs/default.renewalRetryPolicy`:

```json
{"maxRetries": 3, "intervalHours": 24, "gracePeriodHours": 72}
```

Payment Configuration edits these settings through the payment feature. Each
new failure snapshots its policy: 0–10 additional automatic attempts, intervals
of 1–168 whole hours, and independent grace of 1–1680 hours. Replacement invoices,
manual attempts, duplicate events and configuration changes never reset the
original deadline or automatic counter. Exhausting automatic retries early leaves
access active until the deadline. No new automatic attempt starts at/after grace.

`invoice.payment_failed` and `invoice.payment_action_required` start recovery for
a newly failed `subscription_cycle` invoice. Initial checkout retains its existing
flow. `RENEWAL_RECOVERY_START_AT` can override the documented UTC rollout boundary
in `domain/renewal_episode.js`; invoice creation before that boundary, and already
registered legacy retry/recovery records, are excluded.

## Stripe and application flow

```text
Verified webhook / guardian subscription API / existing five-minute worker
  -> stripe_payment_subscription: ownership, plan quote, recovery orchestration
  -> payment: retry/grace policy
  -> stripe_payment: full pause, fresh invoice, card payment, verified restart
  -> syllabus_subscription: recovery episode, audit ledger, receipt, access
  -> guardian manage payments / student learning gate
```

1. Disable automatic collection of the failed invoice. Fully pause the flexible
   Stripe subscription with no unused-time credits or outstanding-usage charges.
   Full pause stops new recurring invoices; a collection-only pause is not used.
2. During grace, student access remains active. At the exact deadline learning
   access expires, the worker records Suspended and voids the original unpaid
   renewal invoice. Authentication/processing already started manually may finish
   afterward; its successful payment restores a new paid period.
3. Each retry voids the old unpaid renewal before preparing a new, non-advancing
   standalone draft invoice tagged with the student, subscription, episode and
   attempt. A separate card PaymentIntent is reserved durably before confirmation.
   There is one active attempt per episode and all stages have stable Stripe keys.
4. Automatic charges run off-session. Authentication required is a failed renewal
   requiring manual action: cancel the unfinished PaymentIntent, void its invoice,
   and stop automatic retries. Permanent card errors similarly stop retries and
   request a new card. The guardian keeps the original grace deadline.
5. Manual payment can use the saved card or a new card, and the current plan or a
   different available same-currency plan. The chosen plan activates only on
   success. The page opens Stripe.js bank authentication in the guardian's active
   session. Processing/unknown outcomes block another payment. An abandoned
   attempt must be confirmed cancelled before a fresh attempt is allowed.
6. On verified success, set the draft line's period to the actual successful card
   payment date plus the selected plan's calendar months, then finalize with
   `auto_advance: false` and attach that already successful PaymentIntent. The
   invoice is paid without charging again. Synchronous card capture supplies the
   balance-transaction timestamp; a verified PaymentIntent success event provides
   a fallback. Missing payment-time evidence remains pending, never guessed from
   page refresh time or invoice creation time.
7. Update the registered price history. Resume the same subscription without
   prorations or a resumption charge, then apply the already-paid bridge ending
   at the new paid-through date. Stripe disallows collection-hold updates while
   fully paused, so a verified zero-quantity guard is installed before resume.
   Quantity 1, the selected price and `trial_end` are restored together: an
   interruption cannot collect an additional period. Stripe can report `trialing`
   during this prepaid bridge. The next charge occurs at its end.
8. Only confirmed invoice settlement and billing restart permit the transaction
   restoring access and creating the receipt. Late events cannot undo success.
   Reconciliation retries settlement/restart, never a paid card charge.

Cancellation during grace stops retries and voids the unfinished invoice while
preserving access until the original deadline. Stripe remains fully paused;
explicitly restarting billing later can retain the same subscription ID.

## Persistence and APIs

`syllabus_subscription` owns server-only
`subscriptions/{studentId}/renewalEpisodes/{episodeHash}`. It contains immutable
scope/policy/deadline, the automatic counter, current attempt, replay markers,
leases and due dates. Safe status is mirrored on the student document and its
billing summary. Invoice audit and receipts remain in the existing `invoices`
and `payments` subcollections. No client may read or write private episode data.

Backend orchestration: `manageStripeRenewalRecovery({internalReference,
subscriptionReference, action, invoiceReference?, planId?, quoteReference?,
idempotencyReference?})`, where action is `retry`, `new_card`, `cancel_payment` or
`cancel_renewal`. The authenticated callable derives guardian identity from Auth,
whitelists fields and returns safe management details.

Existing `retryStripeSubscriptionPayment` accepts optional `planId` and
`quoteReference`; current ownership, student link, plan pricing and card selection
are resolved server-side. `getStripeSubscriptionPaymentDetails` and
`getStripeSubscriptionPaymentAction` return v2 recovery progress. Web feature APIs
`prepareStripeRenewalPayment`, `cancelStripeRenewalPayment` and
`cancelStripeRenewalRecovery` use the new authenticated callable. The page only
queries the subscription feature; Stripe.js handles secure entry/authentication.

## Limits and safeguards

Recovery supports simple, flexible, automatically charged, single-item licensed
subscriptions, quantity 1, same currency and fixed 1–24 month terms. Customer
credit balances, discounts/tax configurations, unrelated schedules/holds,
ambiguous billing, canceled subscriptions and lost outcomes outside Stripe's safe
idempotency window require review rather than an unverified new charge. An
applied app-owned plan schedule can be released before pausing. Unsupported
billing control does not extend grace. A payment racing on the original invoice
requires billing review before any further charge.

## Coordinated release

Implementation is local until deployed. Deploy the new `renewalEpisodes`
collection-group index on `nextActionAt` and wait for readiness. Preserve existing
indexes. Deploy both webhooks, `retryStripeRenewals`, payment/management callables,
new `manageStripeRenewalRecovery`, shared modules, protected Firestore rules and
Hosting together. The guardian student-selection release also includes its four
previously added authenticated callables.

For the first release, set `RENEWAL_RECOVERY_START_AT` to the actual rollout UTC
timestamp (Functions environment configuration), then preserve that value on
later releases. The source fallback is for development. This cutoff prevents a
delayed pre-release failure event from enrolling historical debt.

Keep invoice/subscription events enabled. Add `payment_intent.succeeded`,
`payment_intent.payment_failed`, `payment_intent.canceled`,
`payment_intent.processing`, `invoice.voided`, `customer.subscription.paused` and
`customer.subscription.resumed` to both endpoint configurations if they are not
already covered. The existing worker also polls PaymentIntents, so a missing or
late success webhook cannot cause another charge. Full pause/resume requests use
`2026-10-28.endive` per request; ordinary SDK operations retain their API version.
No new secret, scheduler or minimum warm instance is required.

Guardian lookups can enroll a newly failed invoice when its webhook is missing.
This takes ownership and pauses billing without starting a new payment on page
load. With no recorded failure event, Stripe's invoice finalization time (or its
creation time) conservatively anchors grace; page refresh never extends it.

Validation covers transaction conflicts, duplicate requests, expired grace,
automatic authentication and permanent declines, manually delayed 3DS, selected
plans, abandoned payment cancellation, safe DTO boundaries, browser/mobile flows
and local Firestore rules. Isolated Stripe test-mode checks verify full pause,
invoice line periods, paid-intent attachment, same-subscription plan restart and
one recovered charge; test resources are cleaned up. Live bank authentication
and deployed webhook delivery still need release smoke testing.
