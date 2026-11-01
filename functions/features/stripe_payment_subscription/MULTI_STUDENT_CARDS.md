# Guardian card changes across students

Each student retains an individual Stripe subscription and billing record. The
guardian's Stripe customer owns the saved cards, which can fund several student
subscriptions. The manage subscription payments page shows the selected student's
name and defaults card changes to that subscription.

The existing Web and backend subscription APIs accept the optional
`cardChangeScope: "subscription" | "all_students"` on card setup and card update.
Omitting it retains the existing single-subscription behavior. No new public
HTTP function is introduced.

- `getStripeSubscriptionPaymentDetails` adds `studentName`, `cardChangeTargets`
  and `canChangeAllStudents`. The list contains eligible, registered student
  subscriptions owned by the authenticated guardian's current billing customer
  in the selected payment mode, with an active guardian/student link. Deleted,
  canceled, expired and unsupported subscriptions are excluded. A sibling lookup
  failure disables the family choice while preserving individual management.
- `createStripeSubscriptionCardSetup` binds scope to the off-session SetupIntent.
  For a family change it freezes the subscription/student selection in the
  existing `stripeCustomers/.../setupIntents/{id}.cardUpdate` field and binds its
  fingerprint into Stripe metadata. The response returns the confirmed list so
  the page can display it before card confirmation. Ordinary webhook projections
  preserve this selection, including writes that started before it was saved.
- `updateStripeSubscriptionPaymentMethod` verifies the authenticated customer,
  successful SetupIntent, purpose, mode, anchor subscription, selected scope,
  attached card, and stored selection. It rechecks each target's registration,
  guardian link, live Stripe owner and eligibility before writing its explicit
  subscription default. Each write uses the existing per-subscription/SetupIntent
  idempotency key and replay-age protection. A family change does not update
  the customer's general default or subscriptions added after setup began.

Family updates return `cardUpdateResult: {scope, updated, failed, skipped}` with
subscription references. Individual Stripe updates cannot form one atomic
transaction: partial success is displayed per student, and **Finish saving card**
reuses the same SetupIntent and frozen selection. The browser retains scope
across authentication redirects and unknown responses. Completed targets are
verified again on replay; failed targets can be retried. Raw provider errors,
payment-method IDs, fingerprints and full card details are not returned.

Saving a card makes no invoice payment and changes no billing dates, subscription
states, access dates or student access. Existing automatic retry schedules still
apply and can use the changed subscription default. Paying an unpaid renewal with
a new card remains an explicit action for the selected student's invoice.

Release Hosting and the existing `getStripeSubscriptionPaymentDetails`,
`createStripeSetupIntent`, `updateStripeSubscriptionPaymentMethod`,
`stripeTestWebhook`, and `stripeProdWebhook` functions together. The webhook
revisions must also include the Stripe customer projection change so ordinary
setup events preserve family setup metadata. Local tests use fake Stripe data
and do not charge cards.
