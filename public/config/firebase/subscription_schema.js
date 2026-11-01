export const SUBSCRIPTIONS_COLLECTION = "subscriptions";

export const SUBSCRIPTION_PAYMENTS_SUBCOLLECTION = "payments";

export const SUBSCRIPTION_INVOICES_SUBCOLLECTION = "invoices";

export const SUBSCRIPTION_BILLING_EVENTS_SUBCOLLECTION = "billingEvents";

export const paymentModes = Object.freeze({
  "TEST": "test",
  "PROD": "prod"
});

export const paymentProviders = Object.freeze({
  "STRIPE": "stripe"
});

export const subscriptionDocumentIdPattern = "[student_id]";

export const subscriptionPaymentDocumentIdPattern = "[auto_generated_or_scoped_invoice_id]";

export const subscriptionSchema = Object.freeze({
  "collection": "subscriptions",
  "documentId": "[student_id]",
  "fields": {
    "subscriptionType": {
      "type": "string",
      "enum": [
        "trial",
        "ongoing"
      ]
    },
    "activeUntil": {
      "type": "timestamp",
      "nullable": true
    },
    "renewalGraceUntil": {
      "type": "timestamp",
      "nullable": true
    },
    "subscriptionCancellation": {
      "type": "map",
      "nullable": true,
      "fields": {
        "paymentProvider": "string",
        "paymentMode": "string",
        "paymentSubscriptionReference": "string",
        "state": {
          "type": "string",
          "enum": [
            "pending",
            "cancelled"
          ]
        },
        "requestedAt": "timestamp",
        "cancelledAt": {
          "type": "timestamp",
          "nullable": true
        },
        "accessUntil": {
          "type": "timestamp",
          "nullable": true
        }
      }
    },
    "renewalRecovery": {
      "type": "map",
      "nullable": true,
      "fields": {
        "version": "number",
        "state": {
          "type": "string",
          "enum": [
            "pending_hold",
            "held",
            "suspended",
            "pending_payment",
            "pending_reset",
            "cancelled",
            "completed",
            "manual_review"
          ]
        },
        "firstFailedAt": {
          "type": "timestamp",
          "nullable": true
        },
        "graceUntil": {
          "type": "timestamp",
          "nullable": true
        },
        "paidAt": {
          "type": "timestamp",
          "nullable": true
        },
        "paidThrough": {
          "type": "timestamp",
          "nullable": true
        },
        "completedAt": {
          "type": "timestamp",
          "nullable": true
        },
        "lastErrorCode": {
          "type": "string",
          "nullable": true
        },
        "paymentProvider": "string",
        "paymentMode": "string",
        "paymentSubscriptionReference": "string",
        "invoiceReference": "string",
        "episodeReference": {
          "type": "string",
          "nullable": true
        }
      }
    },
    "applicationStatus": {
      "type": "string",
      "enum": [
        "active",
        "suspended"
      ]
    },
    "paymentProvider": {
      "type": "string",
      "nullable": true,
      "enum": [
        "stripe"
      ]
    },
    "paymentMode": {
      "type": "string",
      "nullable": true,
      "enum": [
        "test",
        "prod"
      ]
    },
    "paymentCustomerReference": {
      "type": "string",
      "nullable": true
    },
    "paymentSubscriptionReference": {
      "type": "string",
      "nullable": true
    },
    "planId": {
      "type": "string",
      "nullable": true
    },
    "billingSummary": {
      "type": "map",
      "nullable": true,
      "fields": {
        "paymentProvider": "string",
        "paymentMode": "string",
        "paymentSubscriptionReference": "string",
        "paymentCustomerReference": "string",
        "invoiceReference": "string",
        "invoiceStatus": "string",
        "billingReason": "string",
        "paymentState": "string",
        "paymentIntentStatus": {
          "type": "string",
          "nullable": true
        },
        "subscriptionStatus": "string",
        "amountRemaining": "number",
        "currency": "string",
        "currencyExponent": "number",
        "failureCode": {
          "type": "string",
          "nullable": true
        },
        "lastFailedAt": {
          "type": "timestamp",
          "nullable": true
        },
        "nextPaymentAttemptAt": {
          "type": "timestamp",
          "nullable": true
        },
        "invoiceCreatedAt": "timestamp",
        "subscriptionRegisteredAt": "timestamp",
        "observedAt": "timestamp",
        "updatedAt": "timestamp",
        "renewalRecovery": {
          "type": "map",
          "nullable": true,
          "fields": {
            "version": "number",
            "state": {
              "type": "string",
              "enum": [
                "pending_hold",
                "held",
                "suspended",
                "pending_payment",
                "pending_reset",
                "cancelled",
                "completed",
                "manual_review"
              ]
            },
            "firstFailedAt": {
              "type": "timestamp",
              "nullable": true
            },
            "graceUntil": {
              "type": "timestamp",
              "nullable": true
            },
            "paidAt": {
              "type": "timestamp",
              "nullable": true
            },
            "paidThrough": {
              "type": "timestamp",
              "nullable": true
            },
            "completedAt": {
              "type": "timestamp",
              "nullable": true
            },
            "lastErrorCode": {
              "type": "string",
              "nullable": true
            }
          }
        },
        "renewalRetry": {
          "type": "map",
          "nullable": true,
          "fields": {
            "state": {
              "type": "string",
              "enum": [
                "scheduled",
                "leased",
                "awaiting_action",
                "processing",
                "completed",
                "exhausted",
                "stopped"
              ]
            },
            "maxRetries": "number",
            "intervalHours": "number",
            "attemptsMade": "number",
            "firstFailedAt": "timestamp",
            "graceUntil": "timestamp",
            "nextAttemptAt": {
              "type": "timestamp",
              "nullable": true
            },
            "lastAttemptAt": {
              "type": "timestamp",
              "nullable": true
            },
            "lastOutcome": {
              "type": "string",
              "nullable": true
            },
            "completedAt": {
              "type": "timestamp",
              "nullable": true
            },
            "exhaustedAt": {
              "type": "timestamp",
              "nullable": true
            }
          }
        }
      }
    },
    "createdAt": "timestamp",
    "updatedAt": "timestamp"
  },
  "subcollections": {
    "paymentViews": {
      "collection": "paymentViews",
      "documentId": "[sha256_mode_subscription]",
      "serverOnly": true,
      "fields": {
        "version": "number",
        "studentId": "string",
        "guardianId": "string",
        "mode": "string",
        "subscriptionReference": "string",
        "customerReference": "string",
        "payload": "map",
        "billing": "map",
        "defaultPaymentMethodReference": {
          "type": "string",
          "nullable": true
        },
        "generation": "number",
        "pending": "boolean",
        "reason": {
          "type": "string",
          "nullable": true
        },
        "observedAt": {
          "type": "timestamp",
          "nullable": true
        },
        "nextActionAt": {
          "type": "timestamp",
          "nullable": true
        },
        "leaseToken": {
          "type": "string",
          "nullable": true
        },
        "leaseUntil": {
          "type": "timestamp",
          "nullable": true
        },
        "attempts": "number",
        "lastErrorCode": {
          "type": "string",
          "nullable": true
        },
        "createdAt": "timestamp",
        "updatedAt": "timestamp"
      },
      "description": "Server-owned subscription payment view. Masked card only; never contains payment/setup client secrets. Ordinary page reads use this view; signed webhooks, confirmed commands and reconciliation maintain it."
    },
    "renewalEpisodes": {
      "collection": "renewalEpisodes",
      "documentId": "[sha256_mode_subscription_original_invoice]",
      "serverOnly": true,
      "fields": {
        "id": "string",
        "studentId": "string",
        "guardianId": "string",
        "mode": "string",
        "subscriptionReference": "string",
        "customerReference": "string",
        "originalInvoiceReference": "string",
        "originalInvoice": "map",
        "originalPlanId": "string",
        "currency": "string",
        "policy": "map",
        "firstFailedAt": "timestamp",
        "graceUntil": "timestamp",
        "state": "string",
        "attemptsMade": "number",
        "nextRetryAt": {
          "type": "timestamp",
          "nullable": true
        },
        "nextActionAt": {
          "type": "timestamp",
          "nullable": true
        },
        "lastAttemptAt": {
          "type": "timestamp",
          "nullable": true
        },
        "automaticStoppedReason": {
          "type": "string",
          "nullable": true
        },
        "blockedPaymentMethodReference": {
          "type": "string",
          "nullable": true
        },
        "reason": "string",
        "pausedConfirmed": "boolean",
        "originalDropped": "boolean",
        "expiryApplied": "boolean",
        "attempt": {
          "type": "map",
          "nullable": true,
          "fields": {
            "id": "string",
            "request": "string",
            "kind": "string",
            "methodChoice": "string",
            "state": "string",
            "planId": "string",
            "terms": "map",
            "durationMonths": "number",
            "currencyExponent": "number",
            "priceReference": "string",
            "previousPriceReference": "string",
            "invoiceReference": {
              "type": "string",
              "nullable": true
            },
            "invoiceItemReference": {
              "type": "string",
              "nullable": true
            },
            "paymentIntentReference": {
              "type": "string",
              "nullable": true
            },
            "paymentMethodReference": {
              "type": "string",
              "nullable": true
            },
            "paidPaymentMethodReference": {
              "type": "string",
              "nullable": true
            },
            "successEventAt": {
              "type": "timestamp",
              "nullable": true
            },
            "paidAt": {
              "type": "timestamp",
              "nullable": true
            },
            "paidThrough": {
              "type": "timestamp",
              "nullable": true
            },
            "createdAt": "timestamp",
            "finishedAt": {
              "type": "timestamp",
              "nullable": true
            }
          }
        },
        "requests": "map",
        "leaseToken": {
          "type": "string",
          "nullable": true
        },
        "leaseUntil": {
          "type": "timestamp",
          "nullable": true
        },
        "cancelledAt": {
          "type": "timestamp",
          "nullable": true
        },
        "paidAt": {
          "type": "timestamp",
          "nullable": true
        },
        "paidThrough": {
          "type": "timestamp",
          "nullable": true
        },
        "completedAt": {
          "type": "timestamp",
          "nullable": true
        },
        "completedInvoiceReference": {
          "type": "string",
          "nullable": true
        },
        "lastErrorCode": {
          "type": "string",
          "nullable": true
        },
        "subscriptionRegisteredAt": "timestamp",
        "createdAt": "timestamp",
        "updatedAt": "timestamp"
      }
    },
    "checkouts": {
      "collection": "checkouts",
      "documentId": "stripe_[mode]",
      "fields": {
        "studentId": "string",
        "mode": "string",
        "internalReference": "string",
        "country": "string",
        "planId": "string",
        "customerReference": "string",
        "paymentMethodReference": "string",
        "billingTerms": "map",
        "requestReference": "string",
        "idempotencyReference": "string",
        "subscriptionReference": {
          "type": "string",
          "nullable": true
        },
        "createdAt": "timestamp",
        "updatedAt": "timestamp"
      }
    },
    "invoices": {
      "collection": "invoices",
      "documentId": "[provider_mode_subscription_hash_invoice_hash]",
      "fields": {
        "studentId": "string",
        "paymentProvider": "string",
        "paymentMode": "string",
        "paymentSubscriptionReference": "string",
        "paymentCustomerReference": "string",
        "guardianId": "string",
        "planId": "string",
        "invoiceReference": "string",
        "billingReason": "string",
        "recoveryEpisodeReference": {
          "type": "string",
          "nullable": true
        },
        "stripeBillingReason": {
          "type": "string",
          "nullable": true
        },
        "subscriptionStatus": "string",
        "invoiceStatus": "string",
        "paymentIntentReference": {
          "type": "string",
          "nullable": true
        },
        "paymentIntentStatus": {
          "type": "string",
          "nullable": true
        },
        "paymentState": {
          "type": "string",
          "enum": [
            "unpaid",
            "failed",
            "authentication_required",
            "processing",
            "paid",
            "unavailable"
          ]
        },
        "amountDue": "number",
        "amountPaid": "number",
        "amountRemaining": "number",
        "currency": "string",
        "currencyExponent": "number",
        "invoiceCreatedAt": "timestamp",
        "subscriptionRegisteredAt": "timestamp",
        "observedAt": "timestamp",
        "billingPeriodStart": {
          "type": "timestamp",
          "nullable": true
        },
        "billingPeriodEnd": {
          "type": "timestamp",
          "nullable": true
        },
        "durationMonths": {
          "type": "number",
          "nullable": true
        },
        "attemptCount": "number",
        "nextPaymentAttemptAt": {
          "type": "timestamp",
          "nullable": true
        },
        "failureCode": {
          "type": "string",
          "nullable": true
        },
        "lastFailedAt": {
          "type": "timestamp",
          "nullable": true
        },
        "paidAt": {
          "type": "timestamp",
          "nullable": true
        },
        "isLatestInvoice": "boolean",
        "renewalRecovery": {
          "type": "map",
          "nullable": true,
          "fields": {
            "version": "number",
            "state": {
              "type": "string",
              "enum": [
                "pending_hold",
                "held",
                "suspended",
                "pending_payment",
                "pending_reset",
                "cancelled",
                "completed",
                "manual_review"
              ]
            },
            "firstFailedAt": {
              "type": "timestamp",
              "nullable": true
            },
            "graceUntil": {
              "type": "timestamp",
              "nullable": true
            },
            "paidAt": {
              "type": "timestamp",
              "nullable": true
            },
            "paidThrough": {
              "type": "timestamp",
              "nullable": true
            },
            "completedAt": {
              "type": "timestamp",
              "nullable": true
            },
            "lastErrorCode": {
              "type": "string",
              "nullable": true
            },
            "nextActionAt": {
              "type": "timestamp",
              "nullable": true
            },
            "leaseToken": {
              "type": "string",
              "nullable": true
            },
            "leaseUntil": {
              "type": "timestamp",
              "nullable": true
            }
          }
        },
        "recoveredCoverageStart": {
          "type": "timestamp",
          "nullable": true
        },
        "recoveredCoverageEnd": {
          "type": "timestamp",
          "nullable": true
        },
        "renewalRetry": {
          "type": "map",
          "nullable": true,
          "fields": {
            "state": {
              "type": "string",
              "enum": [
                "scheduled",
                "leased",
                "awaiting_action",
                "processing",
                "completed",
                "exhausted",
                "stopped"
              ]
            },
            "maxRetries": "number",
            "intervalHours": "number",
            "gracePeriodHours": "number",
            "attemptsMade": "number",
            "firstFailedAt": "timestamp",
            "graceUntil": "timestamp",
            "nextAttemptAt": {
              "type": "timestamp",
              "nullable": true
            },
            "nextActionAt": {
              "type": "timestamp",
              "nullable": true
            },
            "lastAttemptAt": {
              "type": "timestamp",
              "nullable": true
            },
            "lastOutcome": {
              "type": "string",
              "nullable": true
            },
            "completedAt": {
              "type": "timestamp",
              "nullable": true
            },
            "exhaustedAt": {
              "type": "timestamp",
              "nullable": true
            },
            "leaseToken": {
              "type": "string",
              "nullable": true
            },
            "leaseUntil": {
              "type": "timestamp",
              "nullable": true
            },
            "attemptReference": {
              "type": "string",
              "nullable": true
            },
            "attemptStartedAt": {
              "type": "timestamp",
              "nullable": true
            },
            "attemptPaymentMethodReference": {
              "type": "string",
              "nullable": true
            }
          }
        },
        "createdAt": "timestamp",
        "updatedAt": "timestamp",
        "accessAppliedAt": {
          "type": "timestamp",
          "nullable": true
        }
      }
    },
    "billingEvents": {
      "collection": "billingEvents",
      "documentId": "[provider_mode_event_hash]",
      "fields": {
        "eventReference": "string",
        "eventType": "string",
        "eventCreatedAt": "timestamp",
        "paymentProvider": "string",
        "paymentMode": "string",
        "invoiceKey": "string",
        "processedAt": "timestamp"
      }
    },
    "payments": {
      "collection": "payments",
      "documentId": "[auto_generated_or_scoped_invoice_id]",
      "fields": {
        "guardianId": "string",
        "planId": "string",
        "durationMonths": "number",
        "amountPaid": "number",
        "currency": "string",
        "paymentDate": "timestamp",
        "paymentProvider": "string",
        "paymentProviderReference": "string",
        "paymentMode": {
          "type": "string",
          "nullable": true
        },
        "paymentSubscriptionReference": {
          "type": "string",
          "nullable": true
        },
        "coverageStart": {
          "type": "timestamp",
          "nullable": true
        },
        "coverageEnd": {
          "type": "timestamp",
          "nullable": true
        },
        "createdAt": "timestamp"
      }
    }
  }
});

export const subscriptionTypes = Object.freeze({
  "TRIAL": "trial",
  "ONGOING": "ongoing"
});

export const subscriptionStatuses = Object.freeze({
  "ACTIVE": "active",
  "SUSPENDED": "suspended"
});
