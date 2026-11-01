const {
  paymentModes,
  paymentProviders,
} = require("./payment_config_schema");

const SUBSCRIPTIONS_COLLECTION = "subscriptions";
const SUBSCRIPTION_PAYMENTS_SUBCOLLECTION = "payments";
const SUBSCRIPTION_INVOICES_SUBCOLLECTION = "invoices";
const SUBSCRIPTION_BILLING_EVENTS_SUBCOLLECTION = "billingEvents";

const subscriptionDocumentIdPattern = "[student_id]";
const subscriptionPaymentDocumentIdPattern = "[auto_generated_or_scoped_invoice_id]";

const subscriptionTypes = Object.freeze({
  TRIAL: "trial",
  ONGOING: "ongoing",
});
const subscriptionStatuses = Object.freeze({ACTIVE: "active", SUSPENDED: "suspended"});

const nullableString = Object.freeze({
  type: "string",
  nullable: true,
});
const nullableTimestamp = Object.freeze({
  type: "timestamp",
  nullable: true,
});

const recoveryFields = {
  version: "number", state: {type: "string", enum: ["pending_hold", "held", "suspended", "pending_payment", "pending_reset", "cancelled", "completed", "manual_review"]},
  firstFailedAt: nullableTimestamp, graceUntil: nullableTimestamp, paidAt: nullableTimestamp,
  paidThrough: nullableTimestamp, completedAt: nullableTimestamp, lastErrorCode: nullableString,
};
const recoverySummarySchema = {type: "map", nullable: true, fields: recoveryFields};

const subscriptionSchema = {
  collection: SUBSCRIPTIONS_COLLECTION,
  documentId: subscriptionDocumentIdPattern,
  fields: {
    subscriptionType: {
      type: "string",
      enum: Object.values(subscriptionTypes),
    },
    activeUntil: nullableTimestamp,
    renewalGraceUntil: nullableTimestamp,
    subscriptionCancellation: {type: "map", nullable: true, fields: {paymentProvider: "string", paymentMode: "string",
      paymentSubscriptionReference: "string", state: {type: "string", enum: ["pending", "cancelled"]},
      requestedAt: "timestamp", cancelledAt: nullableTimestamp, accessUntil: nullableTimestamp}},
    renewalRecovery: {type: "map", nullable: true, fields: {...recoveryFields,
      paymentProvider: "string", paymentMode: "string", paymentSubscriptionReference: "string", invoiceReference: "string", episodeReference: nullableString}},
    applicationStatus: {type: "string", enum: Object.values(subscriptionStatuses)},
    paymentProvider: {
      ...nullableString,
      enum: Object.values(paymentProviders),
    },
    paymentMode: {
      ...nullableString,
      enum: Object.values(paymentModes),
    },
    paymentCustomerReference: nullableString,
    paymentSubscriptionReference: nullableString,
    planId: nullableString,
    billingSummary: {type: "map", nullable: true, fields: {
      paymentProvider: "string", paymentMode: "string", paymentSubscriptionReference: "string",
      paymentCustomerReference: "string", invoiceReference: "string", invoiceStatus: "string", billingReason: "string",
      paymentState: "string", paymentIntentStatus: nullableString, subscriptionStatus: "string",
      amountRemaining: "number", currency: "string", currencyExponent: "number",
      failureCode: nullableString, lastFailedAt: nullableTimestamp, nextPaymentAttemptAt: nullableTimestamp,
      invoiceCreatedAt: "timestamp", subscriptionRegisteredAt: "timestamp", observedAt: "timestamp", updatedAt: "timestamp",
      renewalRecovery: recoverySummarySchema,
      renewalRetry: {type: "map", nullable: true, fields: {
        state: {type: "string", enum: ["scheduled", "leased", "awaiting_action", "processing", "completed", "exhausted", "stopped"]},
        maxRetries: "number", intervalHours: "number", attemptsMade: "number",
        firstFailedAt: "timestamp", graceUntil: "timestamp", nextAttemptAt: nullableTimestamp,
        lastAttemptAt: nullableTimestamp, lastOutcome: nullableString, completedAt: nullableTimestamp, exhaustedAt: nullableTimestamp,
      }},
    }},
    createdAt: "timestamp",
    updatedAt: "timestamp",
  },
  subcollections: {
    paymentViews: {
      collection: "paymentViews", documentId: "[sha256_mode_subscription]", serverOnly: true,
      fields: {version: "number", studentId: "string", guardianId: "string", mode: "string",
        subscriptionReference: "string", customerReference: "string", payload: "map", billing: "map",
        defaultPaymentMethodReference: nullableString, generation: "number", pending: "boolean", reason: nullableString,
        observedAt: nullableTimestamp, nextActionAt: nullableTimestamp, leaseToken: nullableString, leaseUntil: nullableTimestamp,
        attempts: "number", lastErrorCode: nullableString, createdAt: "timestamp", updatedAt: "timestamp"},
      description: "Server-owned subscription payment view. Masked card only; never contains payment/setup client secrets. Ordinary page reads use this view; signed webhooks, confirmed commands and reconciliation maintain it.",
    },
    renewalEpisodes: {
      collection: "renewalEpisodes", documentId: "[sha256_mode_subscription_original_invoice]",
      serverOnly: true,
      fields: {id: "string", studentId: "string", guardianId: "string", mode: "string",
        subscriptionReference: "string", customerReference: "string", originalInvoiceReference: "string",
        originalInvoice: "map", originalPlanId: "string", currency: "string", policy: "map",
        firstFailedAt: "timestamp", graceUntil: "timestamp", state: "string", attemptsMade: "number",
        nextRetryAt: nullableTimestamp, nextActionAt: nullableTimestamp, lastAttemptAt: nullableTimestamp,
        automaticStoppedReason: nullableString, blockedPaymentMethodReference: nullableString,
        reason: "string", pausedConfirmed: "boolean", originalDropped: "boolean", expiryApplied: "boolean",
        attempt: {type: "map", nullable: true, fields: {id: "string", request: "string", kind: "string", methodChoice: "string", state: "string",
          planId: "string", terms: "map", durationMonths: "number", currencyExponent: "number", priceReference: "string", previousPriceReference: "string",
          invoiceReference: nullableString, invoiceItemReference: nullableString, paymentIntentReference: nullableString,
          paymentMethodReference: nullableString, paidPaymentMethodReference: nullableString, successEventAt: nullableTimestamp,
          paidAt: nullableTimestamp, paidThrough: nullableTimestamp, createdAt: "timestamp", finishedAt: nullableTimestamp}},
        requests: "map", leaseToken: nullableString, leaseUntil: nullableTimestamp, cancelledAt: nullableTimestamp,
        paidAt: nullableTimestamp, paidThrough: nullableTimestamp, completedAt: nullableTimestamp,
        completedInvoiceReference: nullableString, lastErrorCode: nullableString,
        subscriptionRegisteredAt: "timestamp", createdAt: "timestamp", updatedAt: "timestamp"},
    },
    checkouts: {
      collection: "checkouts", documentId: "stripe_[mode]",
      fields: {studentId: "string", mode: "string", internalReference: "string", country: "string", planId: "string",
        customerReference: "string", paymentMethodReference: "string", billingTerms: "map", requestReference: "string",
        idempotencyReference: "string", subscriptionReference: nullableString, createdAt: "timestamp", updatedAt: "timestamp"},
    },
    invoices: {
      collection: SUBSCRIPTION_INVOICES_SUBCOLLECTION,
      documentId: "[provider_mode_subscription_hash_invoice_hash]",
      fields: {
        studentId: "string", paymentProvider: "string", paymentMode: "string",
        paymentSubscriptionReference: "string", paymentCustomerReference: "string",
        guardianId: "string", planId: "string", invoiceReference: "string", billingReason: "string",
        recoveryEpisodeReference: nullableString, stripeBillingReason: nullableString,
        subscriptionStatus: "string", invoiceStatus: "string", paymentIntentReference: nullableString,
        paymentIntentStatus: nullableString, paymentState: {type: "string", enum: ["unpaid", "failed", "authentication_required", "processing", "paid", "unavailable"]},
        amountDue: "number", amountPaid: "number", amountRemaining: "number", currency: "string", currencyExponent: "number",
        invoiceCreatedAt: "timestamp", subscriptionRegisteredAt: "timestamp", observedAt: "timestamp",
        billingPeriodStart: nullableTimestamp, billingPeriodEnd: nullableTimestamp, durationMonths: {type: "number", nullable: true},
        attemptCount: "number", nextPaymentAttemptAt: nullableTimestamp, failureCode: nullableString,
        lastFailedAt: nullableTimestamp, paidAt: nullableTimestamp, isLatestInvoice: "boolean",
        renewalRecovery: {type: "map", nullable: true, fields: {...recoveryFields,
          nextActionAt: nullableTimestamp, leaseToken: nullableString, leaseUntil: nullableTimestamp}},
        recoveredCoverageStart: nullableTimestamp, recoveredCoverageEnd: nullableTimestamp,
        renewalRetry: {type: "map", nullable: true, fields: {
          state: {type: "string", enum: ["scheduled", "leased", "awaiting_action", "processing", "completed", "exhausted", "stopped"]},
          maxRetries: "number", intervalHours: "number", gracePeriodHours: "number", attemptsMade: "number",
          firstFailedAt: "timestamp", graceUntil: "timestamp", nextAttemptAt: nullableTimestamp,
          nextActionAt: nullableTimestamp, lastAttemptAt: nullableTimestamp, lastOutcome: nullableString,
          completedAt: nullableTimestamp, exhaustedAt: nullableTimestamp,
          leaseToken: nullableString, leaseUntil: nullableTimestamp,
          attemptReference: nullableString, attemptStartedAt: nullableTimestamp,
          attemptPaymentMethodReference: nullableString,
        }},
        createdAt: "timestamp", updatedAt: "timestamp", accessAppliedAt: nullableTimestamp,
      },
    },
    billingEvents: {
      collection: SUBSCRIPTION_BILLING_EVENTS_SUBCOLLECTION,
      documentId: "[provider_mode_event_hash]",
      fields: {eventReference: "string", eventType: "string", eventCreatedAt: "timestamp",
        paymentProvider: "string", paymentMode: "string", invoiceKey: "string", processedAt: "timestamp"},
    },
    payments: {
      collection: SUBSCRIPTION_PAYMENTS_SUBCOLLECTION,
      documentId: subscriptionPaymentDocumentIdPattern,
      fields: {
        guardianId: "string",
        planId: "string",
        durationMonths: "number",
        amountPaid: "number",
        currency: "string",
        paymentDate: "timestamp",
        paymentProvider: "string",
        paymentProviderReference: "string",
        paymentMode: nullableString,
        paymentSubscriptionReference: nullableString,
        coverageStart: nullableTimestamp, coverageEnd: nullableTimestamp,
        createdAt: "timestamp",
      },
    },
  },
};

module.exports = {
  SUBSCRIPTIONS_COLLECTION,
  SUBSCRIPTION_PAYMENTS_SUBCOLLECTION,
  SUBSCRIPTION_INVOICES_SUBCOLLECTION,
  SUBSCRIPTION_BILLING_EVENTS_SUBCOLLECTION,
  paymentModes,
  paymentProviders,
  subscriptionDocumentIdPattern,
  subscriptionPaymentDocumentIdPattern,
  subscriptionSchema,
  subscriptionTypes,
  subscriptionStatuses,
};
