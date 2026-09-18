const {createHash} = require("node:crypto");
const {
  STRIPE_CUSTOMERS_COLLECTION,
  STRIPE_CUSTOMER_RECORDS_SUBCOLLECTION,
  STRIPE_INTERNAL_REFERENCES_SUBCOLLECTION,
  STRIPE_PAYMENT_METHODS_SUBCOLLECTION,
  STRIPE_SETUP_INTENTS_SUBCOLLECTION,
  STRIPE_SUBSCRIPTIONS_SUBCOLLECTION,
} = require("../../../schema/stripe_customer_schema");
const firebaseOps = require("../../../utils/firebase/firebase_ops");
const {
  StripeCustomerRecord,
  StripePaymentMethodRecord,
  StripeSetupIntentRecord,
  StripeSubscriptionRecord,
  normalizeMode,
  requireDocumentReference,
  requireText,
} = require("../domain/stripe_customer_records");
const {
  StripeCustomerRepository,
} = require("../domain/stripe_customer_repository");

function customerCollectionPath(mode) {
  return [
    STRIPE_CUSTOMERS_COLLECTION,
    normalizeMode(mode),
    STRIPE_CUSTOMER_RECORDS_SUBCOLLECTION,
  ].join("/");
}

function internalReferenceCollectionPath(mode) {
  return [
    STRIPE_CUSTOMERS_COLLECTION,
    normalizeMode(mode),
    STRIPE_INTERNAL_REFERENCES_SUBCOLLECTION,
  ].join("/");
}

function customerChildCollectionPath(
  mode,
  customerReference,
  subcollection,
) {
  return [
    customerCollectionPath(mode),
    requireDocumentReference(customerReference, "customerReference"),
    subcollection,
  ].join("/");
}

function internalReferenceDocumentId(internalReference) {
  return createHash("sha256")
    .update(requireText(internalReference, "internalReference"), "utf8")
    .digest("hex");
}

function alreadyExists(message) {
  const error = new Error(message);
  error.code = "already-exists";
  return error;
}

function notFound(message) {
  const error = new Error(message);
  error.code = "not-found";
  return error;
}

function snapshotData(snapshot) {
  return snapshot.exists ? snapshot.data() || {} : null;
}

function customerRecordData(record) {
  return {
    internalReference: record.internalReference,
    email: record.email,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function internalReferenceData(record) {
  return {
    internalReference: record.internalReference,
    customerReference: record.customerReference,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function setupIntentRecordData(record) {
  return {
    status: record.status,
    usage: record.usage,
    paymentMethodReference: record.paymentMethodReference,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function paymentMethodRecordData(record) {
  return {
    setupIntentReference: record.setupIntentReference,
    type: record.type,
    status: record.status,
    card: record.card,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function subscriptionRecordData(record) {
  return {
    studentId: record.studentId,
    planId: record.planId,
    paymentMethodReference: record.paymentMethodReference,
    status: record.status,
    amount: record.amount,
    currency: record.currency,
    interval: record.interval,
    intervalCount: record.intervalCount,
    subscriptionStartDate: record.subscriptionStartDate,
    currentPeriodStart: record.currentPeriodStart,
    currentPeriodEnd: record.currentPeriodEnd,
    cancelAtPeriodEnd: record.cancelAtPeriodEnd,
    latestInvoiceReference: record.latestInvoiceReference,
    latestInvoiceStatus: record.latestInvoiceStatus,
    latestPaymentStatus: record.latestPaymentStatus,
    paymentActionRequiredAt: record.paymentActionRequiredAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function toCustomerRecord(data, mode, customerReference) {
  if (!data) {
    return null;
  }

  return new StripeCustomerRecord({
    mode,
    customerReference,
    internalReference: data.internalReference,
    email: data.email,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  });
}

function toSetupIntentRecord(data, mode, customerReference, reference) {
  if (!data) {
    return null;
  }

  return new StripeSetupIntentRecord({
    mode,
    customerReference,
    setupIntentReference: reference,
    ...data,
  });
}

function toPaymentMethodRecord(data, mode, customerReference, reference) {
  if (!data) {
    return null;
  }

  return new StripePaymentMethodRecord({
    mode,
    customerReference,
    paymentMethodReference: reference,
    ...data,
  });
}

function toSubscriptionRecord(data, mode, customerReference, reference) {
  if (!data) {
    return null;
  }

  return new StripeSubscriptionRecord({
    mode,
    customerReference,
    subscriptionReference: reference,
    ...data,
  });
}

function compareReferences(fieldName) {
  return (first, second) => first[fieldName].localeCompare(second[fieldName]);
}

class FirestoreStripeCustomerRepository extends StripeCustomerRepository {
  constructor({
    deleteDocument = firebaseOps.deleteDocument,
    getDocumentRef = firebaseOps.getDocumentRef,
    getFirestoreDb = firebaseOps.getFirestoreDb,
    readCollection = firebaseOps.readCollection,
    readCollectionIds = firebaseOps.readCollectionIds,
    readDocument = firebaseOps.readDocument,
    writeDocument = firebaseOps.writeDocument,
  } = {}) {
    super();
    this.deleteDocument = deleteDocument;
    this.getDocumentRef = getDocumentRef;
    this.getFirestoreDb = getFirestoreDb;
    this.readCollection = readCollection;
    this.readCollectionIds = readCollectionIds;
    this.readDocument = readDocument;
    this.writeDocument = writeDocument;
  }

  async createCustomer(record) {
    const normalizedRecord = record instanceof StripeCustomerRecord
      ? record
      : new StripeCustomerRecord(record);
    const modeDocument = this.getDocumentRef(
      STRIPE_CUSTOMERS_COLLECTION,
      normalizedRecord.mode,
    );
    const customerDocument = this.getDocumentRef(
      customerCollectionPath(normalizedRecord.mode),
      normalizedRecord.customerReference,
    );
    const internalReferenceDocument = this.getDocumentRef(
      internalReferenceCollectionPath(normalizedRecord.mode),
      internalReferenceDocumentId(normalizedRecord.internalReference),
    );

    await this.getFirestoreDb().runTransaction(async (transaction) => {
      const [customerSnapshot, internalReferenceSnapshot] = await Promise.all([
        transaction.get(customerDocument),
        transaction.get(internalReferenceDocument),
      ]);

      if (customerSnapshot.exists) {
        throw alreadyExists(
          `Customer ${normalizedRecord.customerReference} already exists.`,
        );
      }

      if (internalReferenceSnapshot.exists) {
        throw alreadyExists(
          `Internal reference ${normalizedRecord.internalReference} ` +
          "already has a Stripe customer record.",
        );
      }

      transaction.set(
        modeDocument,
        {mode: normalizedRecord.mode},
        {merge: true},
      );
      transaction.set(
        customerDocument,
        customerRecordData(normalizedRecord),
      );
      transaction.set(
        internalReferenceDocument,
        internalReferenceData(normalizedRecord),
      );
    });

    return normalizedRecord;
  }

  async getCustomerByReference(mode, customerReference) {
    const normalizedMode = normalizeMode(mode);
    const reference = requireDocumentReference(
      customerReference,
      "customerReference",
    );
    const data = await this.readDocument(
      customerCollectionPath(normalizedMode),
      reference,
      {includeId: false},
    );

    return toCustomerRecord(data, normalizedMode, reference);
  }

  async getCustomerByInternalReference(mode, internalReference) {
    const normalizedMode = normalizeMode(mode);
    const reference = requireText(internalReference, "internalReference");
    const lookup = await this.readDocument(
      internalReferenceCollectionPath(normalizedMode),
      internalReferenceDocumentId(reference),
      {includeId: false},
    );

    if (!lookup || lookup.internalReference !== reference) {
      return null;
    }

    return this.getCustomerByReference(
      normalizedMode,
      lookup.customerReference,
    );
  }

  async updateCustomer(record, previousInternalReference) {
    const normalizedRecord = record instanceof StripeCustomerRecord
      ? record
      : new StripeCustomerRecord(record);
    const previousReference = requireText(
      previousInternalReference,
      "previousInternalReference",
    );
    const customerDocument = this.getDocumentRef(
      customerCollectionPath(normalizedRecord.mode),
      normalizedRecord.customerReference,
    );
    const previousLookupDocument = this.getDocumentRef(
      internalReferenceCollectionPath(normalizedRecord.mode),
      internalReferenceDocumentId(previousReference),
    );
    const nextLookupDocument = this.getDocumentRef(
      internalReferenceCollectionPath(normalizedRecord.mode),
      internalReferenceDocumentId(normalizedRecord.internalReference),
    );

    await this.getFirestoreDb().runTransaction(async (transaction) => {
      const customerSnapshot = await transaction.get(customerDocument);

      if (!customerSnapshot.exists) {
        throw notFound("Stripe customer record could not be found.");
      }

      if (previousReference !== normalizedRecord.internalReference) {
        const nextLookupSnapshot = await transaction.get(nextLookupDocument);
        const nextLookup = snapshotData(nextLookupSnapshot);

        if (
          nextLookup &&
          nextLookup.customerReference !== normalizedRecord.customerReference
        ) {
          throw alreadyExists(
            `Internal reference ${normalizedRecord.internalReference} ` +
            "already has a Stripe customer record.",
          );
        }

        transaction.delete(previousLookupDocument);
      }

      transaction.set(customerDocument, customerRecordData(normalizedRecord));
      transaction.set(
        nextLookupDocument,
        internalReferenceData(normalizedRecord),
      );
    });

    return normalizedRecord;
  }

  async replaceCustomer(staleCustomerReference, record) {
    const normalizedRecord = record instanceof StripeCustomerRecord
      ? record
      : new StripeCustomerRecord(record);
    const staleReference = requireDocumentReference(
      staleCustomerReference,
      "staleCustomerReference",
    );

    if (staleReference === normalizedRecord.customerReference) {
      throw new Error(
        "Replacement customer reference must differ from the stale reference.",
      );
    }

    const modeDocument = this.getDocumentRef(
      STRIPE_CUSTOMERS_COLLECTION,
      normalizedRecord.mode,
    );
    const staleCustomerDocument = this.getDocumentRef(
      customerCollectionPath(normalizedRecord.mode),
      staleReference,
    );
    const replacementCustomerDocument = this.getDocumentRef(
      customerCollectionPath(normalizedRecord.mode),
      normalizedRecord.customerReference,
    );
    const lookupDocument = this.getDocumentRef(
      internalReferenceCollectionPath(normalizedRecord.mode),
      internalReferenceDocumentId(normalizedRecord.internalReference),
    );

    await this.getFirestoreDb().runTransaction(async (transaction) => {
      const [
        staleCustomerSnapshot,
        replacementCustomerSnapshot,
        lookupSnapshot,
      ] = await Promise.all([
        transaction.get(staleCustomerDocument),
        transaction.get(replacementCustomerDocument),
        transaction.get(lookupDocument),
      ]);
      const staleCustomer = snapshotData(staleCustomerSnapshot);
      const lookup = snapshotData(lookupSnapshot);

      if (
        !staleCustomer
        || staleCustomer.internalReference
          !== normalizedRecord.internalReference
        || !lookup
        || lookup.internalReference !== normalizedRecord.internalReference
        || lookup.customerReference !== staleReference
      ) {
        throw notFound(
          "The stale Stripe customer record could not be replaced.",
        );
      }

      if (replacementCustomerSnapshot.exists) {
        throw alreadyExists(
          "Customer " + normalizedRecord.customerReference
            + " already exists.",
        );
      }

      transaction.set(
        modeDocument,
        {mode: normalizedRecord.mode},
        {merge: true},
      );
      transaction.set(
        replacementCustomerDocument,
        customerRecordData(normalizedRecord),
      );
      transaction.set(
        lookupDocument,
        internalReferenceData(normalizedRecord),
      );
    });

    return normalizedRecord;
  }

  async deleteCustomer(mode, customerReference) {
    const normalizedMode = normalizeMode(mode);
    const reference = requireDocumentReference(
      customerReference,
      "customerReference",
    );
    const customer = await this.getCustomerByReference(
      normalizedMode,
      reference,
    );

    if (!customer) {
      return;
    }

    const childCollections = [
      STRIPE_SETUP_INTENTS_SUBCOLLECTION,
      STRIPE_PAYMENT_METHODS_SUBCOLLECTION,
      STRIPE_SUBSCRIPTIONS_SUBCOLLECTION,
    ];

    await Promise.all(childCollections.map(async (subcollection) => {
      const collectionPath = customerChildCollectionPath(
        normalizedMode,
        reference,
        subcollection,
      );
      const documentIds = await this.readCollectionIds(collectionPath);

      await Promise.all(documentIds.map((documentId) => (
        this.deleteDocument(collectionPath, documentId)
      )));
    }));

    const customerDocument = this.getDocumentRef(
      customerCollectionPath(normalizedMode),
      reference,
    );
    const lookupDocument = this.getDocumentRef(
      internalReferenceCollectionPath(normalizedMode),
      internalReferenceDocumentId(customer.internalReference),
    );

    await this.getFirestoreDb().runTransaction(async (transaction) => {
      const lookupSnapshot = await transaction.get(lookupDocument);

      transaction.delete(customerDocument);

      if (
        snapshotData(lookupSnapshot)?.customerReference === reference
      ) {
        transaction.delete(lookupDocument);
      }
    });
  }

  async assertCustomerExists(mode, customerReference) {
    const customer = await this.getCustomerByReference(
      mode,
      customerReference,
    );

    if (!customer) {
      throw notFound("Stripe customer record could not be found.");
    }
  }

  async writeSetupIntent(record) {
    const normalizedRecord = record instanceof StripeSetupIntentRecord
      ? record
      : new StripeSetupIntentRecord(record);

    await this.assertCustomerExists(
      normalizedRecord.mode,
      normalizedRecord.customerReference,
    );
    await this.writeDocument(
      customerChildCollectionPath(
        normalizedRecord.mode,
        normalizedRecord.customerReference,
        STRIPE_SETUP_INTENTS_SUBCOLLECTION,
      ),
      normalizedRecord.setupIntentReference,
      setupIntentRecordData(normalizedRecord),
      {merge: false},
    );

    return normalizedRecord;
  }

  async getSetupIntent(input) {
    return this.getChildRecord({
      ...input,
      subcollection: STRIPE_SETUP_INTENTS_SUBCOLLECTION,
      reference: input?.setupIntentReference,
      referenceName: "setupIntentReference",
      toRecord: toSetupIntentRecord,
    });
  }

  async listSetupIntents(input) {
    return this.listChildRecords({
      ...input,
      subcollection: STRIPE_SETUP_INTENTS_SUBCOLLECTION,
      referenceName: "setupIntentReference",
      toRecord: toSetupIntentRecord,
    });
  }

  async deleteSetupIntent(input) {
    await this.deleteChildRecord({
      ...input,
      subcollection: STRIPE_SETUP_INTENTS_SUBCOLLECTION,
      reference: input?.setupIntentReference,
      referenceName: "setupIntentReference",
    });
  }

  async writePaymentMethod(record) {
    const normalizedRecord = record instanceof StripePaymentMethodRecord
      ? record
      : new StripePaymentMethodRecord(record);

    await this.assertCustomerExists(
      normalizedRecord.mode,
      normalizedRecord.customerReference,
    );
    await this.writeDocument(
      customerChildCollectionPath(
        normalizedRecord.mode,
        normalizedRecord.customerReference,
        STRIPE_PAYMENT_METHODS_SUBCOLLECTION,
      ),
      normalizedRecord.paymentMethodReference,
      paymentMethodRecordData(normalizedRecord),
      {merge: false},
    );

    return normalizedRecord;
  }

  async getPaymentMethod(input) {
    return this.getChildRecord({
      ...input,
      subcollection: STRIPE_PAYMENT_METHODS_SUBCOLLECTION,
      reference: input?.paymentMethodReference,
      referenceName: "paymentMethodReference",
      toRecord: toPaymentMethodRecord,
    });
  }

  async listPaymentMethods(input) {
    return this.listChildRecords({
      ...input,
      subcollection: STRIPE_PAYMENT_METHODS_SUBCOLLECTION,
      referenceName: "paymentMethodReference",
      toRecord: toPaymentMethodRecord,
    });
  }

  async deletePaymentMethod(input) {
    await this.deleteChildRecord({
      ...input,
      subcollection: STRIPE_PAYMENT_METHODS_SUBCOLLECTION,
      reference: input?.paymentMethodReference,
      referenceName: "paymentMethodReference",
    });
  }

  async writeSubscription(record) {
    const normalizedRecord = record instanceof StripeSubscriptionRecord
      ? record
      : new StripeSubscriptionRecord(record);

    await this.assertCustomerExists(
      normalizedRecord.mode,
      normalizedRecord.customerReference,
    );
    await this.writeDocument(
      customerChildCollectionPath(
        normalizedRecord.mode,
        normalizedRecord.customerReference,
        STRIPE_SUBSCRIPTIONS_SUBCOLLECTION,
      ),
      normalizedRecord.subscriptionReference,
      subscriptionRecordData(normalizedRecord),
      {merge: false},
    );

    return normalizedRecord;
  }

  async getSubscription(input) {
    return this.getChildRecord({
      ...input,
      subcollection: STRIPE_SUBSCRIPTIONS_SUBCOLLECTION,
      reference: input?.subscriptionReference,
      referenceName: "subscriptionReference",
      toRecord: toSubscriptionRecord,
    });
  }

  async listSubscriptions(input) {
    return this.listChildRecords({
      ...input,
      subcollection: STRIPE_SUBSCRIPTIONS_SUBCOLLECTION,
      referenceName: "subscriptionReference",
      toRecord: toSubscriptionRecord,
    });
  }

  async deleteSubscription(input) {
    await this.deleteChildRecord({
      ...input,
      subcollection: STRIPE_SUBSCRIPTIONS_SUBCOLLECTION,
      reference: input?.subscriptionReference,
      referenceName: "subscriptionReference",
    });
  }

  async getChildRecord({
    mode,
    customerReference,
    subcollection,
    reference,
    referenceName,
    toRecord,
  }) {
    const normalizedMode = normalizeMode(mode);
    const customerId = requireDocumentReference(
      customerReference,
      "customerReference",
    );
    const childReference = requireDocumentReference(reference, referenceName);
    const data = await this.readDocument(
      customerChildCollectionPath(
        normalizedMode,
        customerId,
        subcollection,
      ),
      childReference,
      {includeId: false},
    );

    return toRecord(data, normalizedMode, customerId, childReference);
  }

  async listChildRecords({
    mode,
    customerReference,
    subcollection,
    referenceName,
    toRecord,
  }) {
    const normalizedMode = normalizeMode(mode);
    const customerId = requireDocumentReference(
      customerReference,
      "customerReference",
    );
    const records = await this.readCollection(
      customerChildCollectionPath(
        normalizedMode,
        customerId,
        subcollection,
      ),
    );

    return records
      .map((record) => toRecord(
        record,
        normalizedMode,
        customerId,
        record.id,
      ))
      .sort(compareReferences(referenceName));
  }

  async deleteChildRecord({
    mode,
    customerReference,
    subcollection,
    reference,
    referenceName,
  }) {
    const normalizedMode = normalizeMode(mode);
    const customerId = requireDocumentReference(
      customerReference,
      "customerReference",
    );
    const childReference = requireDocumentReference(reference, referenceName);

    await this.deleteDocument(
      customerChildCollectionPath(
        normalizedMode,
        customerId,
        subcollection,
      ),
      childReference,
    );
  }
}

module.exports = {
  FirestoreStripeCustomerRepository,
  customerCollectionPath,
  customerChildCollectionPath,
  internalReferenceCollectionPath,
  internalReferenceDocumentId,
};
