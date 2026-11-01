/**
 * Guardian subscription APIs (all use authenticated backend callables):
 *
 * getStripeGuardianSubscriptionOptions({studentId?, subscriptionReference?, refreshFromStripe?: boolean})
 *   -> linked students, selected subscription, priced plans, saved-card summary,
 *      creation eligibility and any scheduled next-renewal plan.
 * prepareStripeStudentSubscription({studentId, planId, quoteReference, idempotencyReference})
 *   -> {setupIntentReference, clientSecret} for new subscription card setup.
 * createStripeStudentSubscription({studentId, planId, quoteReference,
 *   idempotencyReference, setupIntentReference? | savedCardReference?})
 *   -> {subscriptionReference, status}; initial confirmation uses existing checkout.
 * changeStripeStudentSubscriptionPlan({studentId, planId, quoteReference, idempotencyReference})
 *   -> refreshed options; changes the same subscription at its next renewal.
 * cancelStripeStudentSubscription({subscriptionReference}) -> management details
 *   Immediately cancels in Stripe after reconciling any payment in progress.
 *   Keeps existing paid/grace access. Replacement checkout defers its first
 *   charge until existing paid access ends. Uses the existing recovery callable.
 *
 * getStripeSubscriptionPaymentDetails({subscriptionReference, invoiceReference?, refreshFromStripe?: boolean})
 *   -> Promise<{subscriptionReference, subscriptionStatus, applicationStatus,
 *      renewalRetry, currentCard,
 *      canChangeCard, paymentState, renewal, nextChargeAt, linkedInvoiceIsCurrent,
 *      syncState}>
 * Both reads consult the schema by default. Only explicit checks/actions request
 * a Stripe refresh. Stored renewal actions contain no payment client secrets;
 * requiresActionFetch directs an explicit guardian action to fetch a fresh secret.
 * getStripeSubscriptionPaymentAction(subscriptionReference |
 *   {subscriptionReference, invoiceReference?, paymentMethodChoice?: "new_card"})
 *   -> Promise<payment-action DTO>
 * retryStripeSubscriptionPayment({subscriptionReference, invoiceReference,
 *   idempotencyReference, planId?, quoteReference?}) -> Promise<payment-action DTO>
 * prepareStripeRenewalPayment({subscriptionReference, invoiceReference?,
 *   idempotencyReference, planId?, quoteReference?}) -> management details/new card secret
 * cancelStripeRenewalPayment({subscriptionReference, invoiceReference?}) -> management details
 * cancelStripeRenewalRecovery({subscriptionReference, invoiceReference?}) -> management details
 * createStripeSubscriptionCardSetup({subscriptionReference, idempotencyReference, cardChangeScope?})
 *   -> Promise<{setupIntentReference, clientSecret}>
 * updateStripeSubscriptionPaymentMethod({subscriptionReference,
 *   invoiceReference?, setupIntentReference, cardChangeScope?}) -> Promise<subscription details>
 *
 * Card changes default to one student. Family setup returns the confirmed student
 * list; family updates return per-subscription updated/failed/skipped results.
 * The backend subscription feature verifies ownership and current Stripe state.
 * Stripe.js card entry and bank authentication belong to stripe_payment.
 */
import {ManageStripeSubscriptionPayment}
  from "./application/manage_subscription_payment.js?v=20261101-stored-status-v1";
import {GetStripeSubscriptionPaymentAction}
  from "./application/get_subscription_payment_action.js?v=20261101-stored-status-v1";
import {RetryStripeSubscriptionPayment}
  from "./application/retry_subscription_payment.js?v=20261101-stored-status-v1";
import {CreateStripeSubscriptionCardSetup}
  from "./application/create_subscription_card_setup.js?v=20261101-stored-status-v1";
import {FirebaseCallableStripeSubscriptionPaymentGateway}
  from "./infrastructure/firebase_callable_stripe_subscription_payment_gateway.js?v=20261101-stored-status-v1";
import {ManageGuardianSubscriptions}
  from "./application/manage_guardian_subscriptions.js?v=20261101-stored-status-v1";
import {ManageRenewalRecovery} from "./application/manage_renewal_recovery.js?v=20261101-stored-status-v1";

const gateway = new FirebaseCallableStripeSubscriptionPaymentGateway();
const management = new ManageStripeSubscriptionPayment(gateway);
const action = new GetStripeSubscriptionPaymentAction(gateway);
const retry = new RetryStripeSubscriptionPayment(gateway);
const cardSetup = new CreateStripeSubscriptionCardSetup(gateway);
const guardianSubscriptions = new ManageGuardianSubscriptions(gateway);
const recovery = new ManageRenewalRecovery(gateway);
export const prepareStripeRenewalPayment = input => recovery.execute(input, "new_card");
export const cancelStripeRenewalPayment = input => recovery.execute(input, "cancel_payment");
export const cancelStripeRenewalRecovery = input => recovery.execute(input, "cancel_renewal");
export const cancelStripeStudentSubscription = input => recovery.execute(input, "cancel_subscription");

export const getStripeGuardianSubscriptionOptions = input => guardianSubscriptions.getOptions(input);
export const prepareStripeStudentSubscription = input => guardianSubscriptions.prepare(input);
export const createStripeStudentSubscription = input => guardianSubscriptions.create(input);
export const changeStripeStudentSubscriptionPlan = input => guardianSubscriptions.changePlan(input);

export const getStripeSubscriptionPaymentDetails = input => management.getDetails(input);
export const getStripeSubscriptionPaymentAction = input => action.execute(input);
export const retryStripeSubscriptionPayment = input => retry.execute(input);
export const createStripeSubscriptionCardSetup = input => cardSetup.execute(input);
export const updateStripeSubscriptionPaymentMethod = input => management.updateCard(input);
