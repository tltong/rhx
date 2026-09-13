const assert = require("node:assert/strict");
const test = require("node:test");

const {
  ManageStripeCustomerRecords,
} = require("./application/manage_stripe_customer_records");
const {
  StripeCustomerRecord,
} = require("./domain/stripe_customer_records");
const {
  FirestoreStripeCustomerRepository,
  internalReferenceDocumentId,
} = require("./infrastructure/firestore_stripe_customer_repository");
const stripeCustomerModule = require("./stripe_customer_module");

const NOW = new Date("2026-09-05T00:00:00.000Z");

function makeMemoryFirestore() {
  const store = new Map();

  function documentPath(collectionPath, documentId) {
    return collectionPath + "/" + documentId;
  }

  function snapshot(path) {
    const data = store.get(path);

    return {
      exists: data !== undefined,
      data: () => data,
    };
  }

  function getDocumentRef(collectionPath, documentId) {
    return {path: documentPath(collectionPath, documentId)};
  }

  const getFirestoreDb = () => ({
    async runTransaction(callback) {
      return callback({
        async get(documentReference) {
          return snapshot(documentReference.path);
        },
        set(documentReference, data, options = {}) {
          const existing = store.get(documentReference.path) || {};
          store.set(
            documentReference.path,
            options.merge ? {...existing, ...data} : {...data},
          );
        },
        delete(documentReference) {
          store.delete(documentReference.path);
        },
      });
    },
  });

  async function readDocument(collectionPath, documentId, options = {}) {
    const data = store.get(documentPath(collectionPath, documentId));

    if (data === undefined) {
      return null;
    }

    return options.includeId === false
      ? data
      : {...data, id: documentId};
  }

  async function readCollection(collectionPath) {
    const prefix = collectionPath + "/";

    return [...store.entries()]
      .filter(([path]) => {
        if (!path.startsWith(prefix)) {
          return false;
        }

        return !path.slice(prefix.length).includes("/");
      })
      .map(([path, data]) => ({
        ...data,
        id: path.slice(prefix.length),
      }));
  }

  async function readCollectionIds(collectionPath) {
    return (await readCollection(collectionPath)).map(({id}) => id);
  }

  async function writeDocument(
    collectionPath,
    documentId,
    data,
    options = {merge: true},
  ) {
    const path = documentPath(collectionPath, documentId);
    const existing = store.get(path) || {};
    store.set(path, options.merge ? {...existing, ...data} : {...data});
  }

  async function deleteDocument(collectionPath, documentId) {
    store.delete(documentPath(collectionPath, documentId));
  }

  return {
    store,
    dependencies: {
      deleteDocument,
      getDocumentRef,
      getFirestoreDb,
      readCollection,
      readCollectionIds,
      readDocument,
      writeDocument,
    },
  };
}

test("stripe customer module exposes persistence APIs only", () => {
  assert.deepEqual(Object.keys(stripeCustomerModule).sort(), [
    "createCustomerRecord",
    "deleteCustomerRecord",
    "deletePaymentMethodRecord",
    "deleteSetupIntentRecord",
    "deleteSubscriptionRecord",
    "getCustomerRecordByInternalReference",
    "getCustomerRecordByReference",
    "getPaymentMethodRecord",
    "getSetupIntentRecord",
    "getSubscriptionRecord",
    "listPaymentMethodRecords",
    "listSetupIntentRecords",
    "listSubscriptionRecords",
    "replaceCustomerRecord",
    "stripeCustomerModes",
    "updateCustomerRecord",
    "writePaymentMethodRecord",
    "writeSetupIntentRecord",
    "writeSubscriptionRecord",
  ]);
});

test("customer records support direct and reverse-reference lookups", async () => {
  const memory = makeMemoryFirestore();
  const repository = new FirestoreStripeCustomerRepository(
    memory.dependencies,
  );
  const records = new ManageStripeCustomerRecords({
    stripeCustomerRepository: repository,
    now: () => NOW,
  });

  const created = await records.createCustomerRecord({
    mode: "test",
    customerReference: "cus_123",
    internalReference: "student/123",
    email: "student@example.com",
  });

  assert.ok(created instanceof StripeCustomerRecord);
  assert.equal(created.internalReference, "student/123");
  assert.equal(created.email, "student@example.com");
  assert.equal(
    memory.store.get("stripeCustomers/test/customers/cus_123")
      .internalReference,
    "student/123",
  );
  assert.equal(
    memory.store.get("stripeCustomers/test/customers/cus_123").email,
    "student@example.com",
  );
  assert.equal(
    memory.store.get(
      "stripeCustomers/test/internalReferences/" +
      internalReferenceDocumentId("student/123"),
    ).customerReference,
    "cus_123",
  );

  assert.equal(
    (await records.getCustomerRecordByReference({
      mode: "test",
      customerReference: "cus_123",
    })).internalReference,
    "student/123",
  );
  assert.equal(
    (await records.getCustomerRecordByInternalReference({
      mode: "test",
      internalReference: "student/123",
    })).customerReference,
    "cus_123",
  );
});

test("updating a customer moves its reverse lookup", async () => {
  const memory = makeMemoryFirestore();
  const repository = new FirestoreStripeCustomerRepository(
    memory.dependencies,
  );
  const records = new ManageStripeCustomerRecords({
    stripeCustomerRepository: repository,
    now: () => NOW,
  });

  await records.createCustomerRecord({
    mode: "prod",
    customerReference: "cus_prod",
    internalReference: "old-reference",
    email: "old@example.com",
  });
  await records.updateCustomerRecord({
    mode: "prod",
    customerReference: "cus_prod",
    changes: {
      internalReference: "new-reference",
      email: "new@example.com",
    },
  });

  assert.equal(await records.getCustomerRecordByInternalReference({
    mode: "prod",
    internalReference: "old-reference",
  }), null);
  assert.equal(
    (await records.getCustomerRecordByInternalReference({
      mode: "prod",
      internalReference: "new-reference",
    })).customerReference,
    "cus_prod",
  );
  assert.equal(
    (await records.getCustomerRecordByReference({
      mode: "prod",
      customerReference: "cus_prod",
    })).email,
    "new@example.com",
  );
});

test("replacing a stale customer moves the active reverse lookup", async () => {
  const memory = makeMemoryFirestore();
  const repository = new FirestoreStripeCustomerRepository(
    memory.dependencies,
  );
  const records = new ManageStripeCustomerRecords({
    stripeCustomerRepository: repository,
    now: () => NOW,
  });

  await records.createCustomerRecord({
    mode: "test",
    customerReference: "cus_stale",
    internalReference: "customer1",
    email: "old@example.com",
  });
  await records.writeSetupIntentRecord({
    mode: "test",
    customerReference: "cus_stale",
    setupIntentReference: "seti_historical",
    status: "requires_payment_method",
    usage: "off_session",
  });
  await records.replaceCustomerRecord({
    mode: "test",
    staleCustomerReference: "cus_stale",
    customerReference: "cus_replacement",
    internalReference: "customer1",
    email: "new@example.com",
  });

  assert.equal(
    (await records.getCustomerRecordByInternalReference({
      mode: "test",
      internalReference: "customer1",
    })).customerReference,
    "cus_replacement",
  );
  assert.equal(
    (await records.getCustomerRecordByReference({
      mode: "test",
      customerReference: "cus_replacement",
    })).email,
    "new@example.com",
  );
  assert.equal(
    (await records.getCustomerRecordByReference({
      mode: "test",
      customerReference: "cus_stale",
    })).email,
    "old@example.com",
  );
  assert.equal(memory.store.has(
    "stripeCustomers/test/customers/cus_stale/" +
    "setupIntents/seti_historical",
  ), true);

  await records.deleteCustomerRecord({
    mode: "test",
    customerReference: "cus_stale",
  });

  assert.equal(
    (await records.getCustomerRecordByInternalReference({
      mode: "test",
      internalReference: "customer1",
    })).customerReference,
    "cus_replacement",
  );
});

test("child record APIs write, read, list, and delete schema data", async () => {
  const memory = makeMemoryFirestore();
  const repository = new FirestoreStripeCustomerRepository(
    memory.dependencies,
  );
  const records = new ManageStripeCustomerRecords({
    stripeCustomerRepository: repository,
    now: () => NOW,
  });
  const customerInput = {
    mode: "test",
    customerReference: "cus_children",
  };

  await records.createCustomerRecord({
    ...customerInput,
    internalReference: "internal-children",
  });
  await records.writeSetupIntentRecord({
    ...customerInput,
    setupIntentReference: "seti_123",
    status: "succeeded",
    usage: "off_session",
    paymentMethodReference: "pm_123",
  });
  await records.writePaymentMethodRecord({
    ...customerInput,
    paymentMethodReference: "pm_123",
    setupIntentReference: "seti_123",
    type: "card",
    status: "active",
    card: {
      brand: "visa",
      last4: "4242",
      expiryMonth: 12,
      expiryYear: 2030,
    },
  });
  await records.writeSubscriptionRecord({
    ...customerInput,
    subscriptionReference: "sub_123",
    paymentMethodReference: "pm_123",
    status: "active",
    amount: 1000,
    currency: "MYR",
    interval: "month",
    intervalCount: 1,
    subscriptionStartDate: new Date("2026-09-01T00:00:00.000Z"),
    cancelAtPeriodEnd: false,
    latestInvoiceReference: "in_123",
    latestInvoiceStatus: "open",
    latestPaymentStatus: "requires_action",
    paymentActionRequiredAt: new Date("2026-09-14T01:02:03.000Z"),
  });

  assert.deepEqual(
    (await records.listSetupIntentRecords(customerInput))
      .map(({setupIntentReference}) => setupIntentReference),
    ["seti_123"],
  );
  assert.equal(
    (await records.getPaymentMethodRecord({
      ...customerInput,
      paymentMethodReference: "pm_123",
    })).card.last4,
    "4242",
  );
  assert.equal(
    (await records.getSubscriptionRecord({
      ...customerInput,
      subscriptionReference: "sub_123",
    })).currency,
    "myr",
  );
  assert.equal(
    (await records.getSubscriptionRecord({
      ...customerInput,
      subscriptionReference: "sub_123",
    })).subscriptionStartDate.toISOString(),
    "2026-09-01T00:00:00.000Z",
  );
  assert.equal(
    (await records.getSubscriptionRecord({
      ...customerInput,
      subscriptionReference: "sub_123",
    })).latestInvoiceReference,
    "in_123",
  );
  assert.equal(
    memory.store.get(
      "stripeCustomers/test/customers/cus_children/" +
      "subscriptions/sub_123",
    ).paymentActionRequiredAt.toISOString(),
    "2026-09-14T01:02:03.000Z",
  );
  assert.equal(
    memory.store.get(
      "stripeCustomers/test/customers/cus_children/" +
      "subscriptions/sub_123",
    ).subscriptionStartDate.toISOString(),
    "2026-09-01T00:00:00.000Z",
  );

  await records.deleteSetupIntentRecord({
    ...customerInput,
    setupIntentReference: "seti_123",
  });
  await records.deletePaymentMethodRecord({
    ...customerInput,
    paymentMethodReference: "pm_123",
  });
  await records.deleteSubscriptionRecord({
    ...customerInput,
    subscriptionReference: "sub_123",
  });

  assert.deepEqual(await records.listSetupIntentRecords(customerInput), []);
  assert.deepEqual(await records.listPaymentMethodRecords(customerInput), []);
  assert.deepEqual(await records.listSubscriptionRecords(customerInput), []);
});

test("deleting a customer removes child records and reverse lookup", async () => {
  const memory = makeMemoryFirestore();
  const repository = new FirestoreStripeCustomerRepository(
    memory.dependencies,
  );
  const records = new ManageStripeCustomerRecords({
    stripeCustomerRepository: repository,
    now: () => NOW,
  });
  const input = {
    mode: "test",
    customerReference: "cus_delete",
  };

  await records.createCustomerRecord({
    ...input,
    internalReference: "delete-me",
  });
  await records.writeSetupIntentRecord({
    ...input,
    setupIntentReference: "seti_delete",
    status: "succeeded",
    usage: "off_session",
  });
  await records.deleteCustomerRecord(input);

  assert.equal(await records.getCustomerRecordByReference(input), null);
  assert.equal(await records.getCustomerRecordByInternalReference({
    mode: "test",
    internalReference: "delete-me",
  }), null);
  assert.equal(memory.store.has(
    "stripeCustomers/test/customers/cus_delete/" +
    "setupIntents/seti_delete",
  ), false);
});
