/** Internal backend APIs for normalized initial/recurring subscription invoices.
 * Scope: {studentId, paymentProvider, paymentMode, paymentSubscriptionReference}.
 * initializeInvoiceRecord({...scope, invoiceRecord}) -> {created, invoiceRecord, ...}
 * getInvoiceRecord({...scope, invoiceReference}) -> invoice|null
 * listInvoiceRecords({...scope, limit?, cursor?}) -> {invoices, nextCursor}
 * recordInvoicePaymentEvent({...scope, eventReference, eventType, eventCreatedAt,
 *   invoiceRecord}) -> {duplicate, invoiceRecord, summaryUpdated, accessUpdated,
 *   receiptCreated}. Ledger, event marker, receipt and entitlement commit atomically.
 * No Stripe calls or browser-supplied payment-success claims are accepted here.
 * Renewal retry state APIs: listDueRenewalRetries, claimRenewalRetry,
 * beginRenewalRetryAttempt and finishRenewalRetry. These mutate retry metadata
 * and applicationStatus. Recovery APIs listDueRenewalRecoveries,
 * claimRenewalRecovery and finishRenewalRecovery hold billing and commit verified
 * restarted coverage. Access expires at the fixed grace deadline; it resumes only
 * after Stripe acknowledges the new paid period.
 */
const {ManageSubscriptionBilling} = require("./application/manage_subscription_billing");
const {FirestoreSubscriptionBillingRepository} = require("./infrastructure/firestore_subscription_billing_repository");
const {FirestoreRenewalRetryRepository} = require("./infrastructure/firestore_renewal_retry_repository");
const {FirestoreRenewalRecoveryRepository} = require("./infrastructure/firestore_renewal_recovery_repository");
const recoveries = new FirestoreRenewalRecoveryRepository();
const billing = new ManageSubscriptionBilling({repository: new FirestoreSubscriptionBillingRepository()});
const renewalRetries = new FirestoreRenewalRetryRepository();
const {FirestoreRenewalEpisodeRepository} = require("./infrastructure/firestore_renewal_episode_repository");
const renewalEpisodes = new FirestoreRenewalEpisodeRepository();
const {FirestoreSubscriptionCancellationRepository} = require("./infrastructure/firestore_subscription_cancellation_repository");
const subscriptionCancellations = new FirestoreSubscriptionCancellationRepository();
const {FirestoreSubscriptionPaymentViewRepository} = require("./infrastructure/firestore_subscription_payment_view_repository");
const paymentViews = new FirestoreSubscriptionPaymentViewRepository();
module.exports = {
  subscriptionPaymentViewRepository: paymentViews,
  subscriptionCancellationRepository: subscriptionCancellations,
  renewalEpisodeRepository: renewalEpisodes,
  listDueRenewalRecoveries: input => recoveries.listDueRenewalRecoveries(input),
  claimRenewalRecovery: input => recoveries.claimRenewalRecovery(input),
  finishRenewalRecovery: input => recoveries.finishRenewalRecovery(input),
  initializeInvoiceRecord: input => billing.initializeInvoiceRecord(input),
  getInvoiceRecord: input => billing.getInvoiceRecord(input),
  listInvoiceRecords: input => billing.listInvoiceRecords(input),
  recordInvoicePaymentEvent: input => billing.recordInvoicePaymentEvent(input),
  listDueRenewalRetries: input => renewalRetries.listDueRenewalRetries(input),
  claimRenewalRetry: input => renewalRetries.claimRenewalRetry(input),
  beginRenewalRetryAttempt: input => renewalRetries.beginRenewalRetryAttempt(input),
  finishRenewalRetry: input => renewalRetries.finishRenewalRetry(input),
};
