Manage subscription payments reads the backend schema by default. Both
getStripeGuardianSubscriptionOptions and getStripeSubscriptionPaymentDetails
accept an optional boolean refreshFromStripe. Only the Check payment status
button and continuation after a guardian payment explicitly request that refresh.
Linked-student selection and bounded pending-state polling never request it.

The server-only subscriptions/{studentId}/paymentViews/{sha256(mode, subscription)}
document stores the sanitized management DTO, masked card, billing metadata and
last confirmation time. Subscription/invoice/entitlement records remain the
authoritative ledger. A newer ledger summary overrides an older view and queues
repair. PaymentIntent and SetupIntent client secrets are never persisted in the
view or returned by its status API. Bank authentication obtains a fresh action
only after the guardian clicks Continue payment.

Verified webhooks queue and refresh the view. Mutating commands invalidate the
view before calling Stripe, then capture confirmed results. Generation checks
prevent an older refresh overwriting a newer command or webhook. Interrupted
updates retain last confirmed data and an Updating payment status indicator.
The existing protected five-minute renewal worker also reconciles due views,
including pending confirmations and expected renewal dates. It never repeats a
payment command to repair a view. Failed refreshes retry with bounded backoff.
Successful active views are scheduled at their next billing date, not polled
continuously. No new external HTTP function or permanently warm instance is added.

Deployment order: deploy private Firestore rules/index and backend first; run
scripts/backfill-subscription-payment-views.js --apply using deployment ADC;
allow the existing worker to populate missing views; then release Hosting.
The script defaults to a read-only dry run and reports counts only. Existing
documents are preserved. An unprepared subscription remains safely pending;
ordinary page reads queue missing views without contacting Stripe.
