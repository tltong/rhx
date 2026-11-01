# Immediate guardian cancellation

The guardian selects one linked student on Manage subscription payments, selects
**Cancel subscription**, reviews the student's remaining access, then confirms.
The customer's other subscriptions and attached cards are preserved.

The Web `stripe_payment_subscription.cancelStripeStudentSubscription` feature API
uses the existing authenticated `manageStripeRenewalRecovery` callable with
`action: "cancel_subscription"`. No new external HTTP function is introduced.
The backend subscription feature verifies the guardian/customer registration and
current student link before invoking the Stripe payment feature. Caller-supplied
customer, amounts, billing dates and access dates are ignored.

Stripe is cancelled immediately with `subscriptions.cancel`, explicitly setting
`invoice_now: false` and `prorate: false`. A scheduled plan change is discarded
by cancelling its subscription schedule. An open unfinished latest invoice is
voided; a payment already processing must be reconciled first. Successful payments
retain the access they purchased. No refund is issued by this flow. Older unpaid
invoices remain outside this operation.

The subscription feature persists a private request at
`subscriptions/{studentId}/subscriptionCancellations/{modeAndSubscriptionHash}`.
Its lease prevents competing callers from cancelling concurrently. The student
document's server-owned `subscriptionCancellation` summary exposes only scope,
pending/cancelled state, request/confirmation timestamps and the access deadline.
The existing protected five-minute worker reconciles interrupted requests and
projects Suspended status when retained access ends. Access rules, browser gates
and backend gates enforce the exact deadline without waiting for that worker.
Neither a page refresh nor a cancellation request submits a payment.

Cancellation during failed-renewal recovery stops automatic retries and voids the
unfinished recovery invoice, retaining the original grace deadline. A successful
payment racing cancellation is settled and its purchased period retained. A new
subscription cannot be created while cancellation is pending. Old recovery jobs
and cancellation jobs cannot overwrite or suspend a replacement subscription.

## Subscribing again

A cancelled Stripe subscription is terminal. Checkout creates a new subscription
for the same guardian customer, using either the saved card or new card setup.
If confirmed cancellation leaves an ongoing paid period, its access end is copied
into the server-only checkout reservation as `billingStartsAt`. Stripe receives
that fixed date as `trial_end` with no proration. This is a prepaid bridge: no card
payment is taken immediately, no additional paid month is granted, and its zero
invoice creates no payment receipt. The page shows the first charge date before
checkout. Once prior paid access has ended, the normal first-payment checkout is
used. Recovery grace is never treated as an additional paid period.

The reservation retains its billing date and Stripe reference across retries.
Its completion replaces only the cancelled student's billing link, clears that
old recovery/cancellation projection and preserves existing access. Future paid
and failed renewal webhooks belong to the replacement subscription.

## Validation and rollout

Tests cover duplicate/lost requests, owner/link checks, payment races, scheduled
plans, retained access, exact expiry, early/expired replacement checkout, safe
DTOs, mobile/desktop interaction and client-write protections.

Deploy the new `subscriptionCancellations.nextActionAt` collection-group index
before the worker, then the protected Firestore rules, Functions and Hosting.
Functions that package these changes are `manageStripeRenewalRecovery`,
`getStripeSubscriptionPaymentDetails`, `getStripeSubscriptionPaymentAction`,
`retryStripeSubscriptionPayment`, `createStripeSetupIntent`,
`updateStripeSubscriptionPaymentMethod`, `getStripeGuardianSubscriptionOptions`,
`prepareStripeStudentSubscription`, `createStripeStudentSubscription`,
`changeStripeStudentSubscriptionPlan`, `createStripeSubscription`,
`stripeTestWebhook`, `stripeProdWebhook` and `retryStripeRenewals`.
Preserve the existing `RENEWAL_RECOVERY_START_AT` rollout boundary.
