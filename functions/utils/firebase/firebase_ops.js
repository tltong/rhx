const { getApps, initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

let firebaseApp = null;
let firestoreDb = null;

function requireNonEmptyString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} must be a non-empty string.`);
  }

  return value.trim();
}

function requireFirestoreData(data) {
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Firestore data must be a non-null object.");
  }
}

function toDocumentData(snapshot, options = {}) {
  if (!snapshot.exists) {
    return null;
  }

  const data = snapshot.data() || {};

  if (options.includeId === false) {
    return data;
  }

  return {
    ...data,
    id: snapshot.id,
  };
}

function documentResult(documentReference) {
  return {
    id: documentReference.id,
    path: documentReference.path,
  };
}

function initFirebase() {
  if (!firebaseApp) {
    firebaseApp = getApps()[0] || initializeApp();
  }

  if (!firestoreDb) {
    firestoreDb = getFirestore(firebaseApp);
  }

  return {
    app: firebaseApp,
    db: firestoreDb,
  };
}

function getFirebaseApp() {
  return initFirebase().app;
}

function getFirestoreDb() {
  return initFirebase().db;
}

function getCollectionRef(collectionPath) {
  const path = requireNonEmptyString(collectionPath, "collectionPath");

  return getFirestoreDb().collection(path);
}

function getDocumentRef(collectionPath, documentId) {
  const collection = getCollectionRef(collectionPath);
  const id = requireNonEmptyString(documentId, "documentId");

  return collection.doc(id);
}

async function createDocument(collectionPath, data, documentId = null) {
  requireFirestoreData(data);

  const documentReference =
    documentId === null || documentId === undefined
      ? getCollectionRef(collectionPath).doc()
      : getDocumentRef(collectionPath, documentId);

  await documentReference.set(data);

  return documentResult(documentReference);
}

async function readDocument(collectionPath, documentId, options = {}) {
  const snapshot = await getDocumentRef(collectionPath, documentId).get();

  return toDocumentData(snapshot, options);
}

async function readCollection(
  collectionPath,
  buildQuery = null,
  options = {},
) {
  const collection = getCollectionRef(collectionPath);
  const query =
    typeof buildQuery === "function" ? buildQuery(collection) : collection;
  const snapshot = await query.get();

  return snapshot.docs.map((documentSnapshot) =>
    toDocumentData(documentSnapshot, options),
  );
}

async function writeDocument(
  collectionPath,
  documentId,
  data,
  options = { merge: true },
) {
  requireFirestoreData(data);

  const documentReference = getDocumentRef(collectionPath, documentId);

  await documentReference.set(data, options);

  return documentResult(documentReference);
}

async function updateDocument(collectionPath, documentId, data) {
  requireFirestoreData(data);

  const documentReference = getDocumentRef(collectionPath, documentId);

  await documentReference.update(data);

  return documentResult(documentReference);
}

async function deleteDocument(collectionPath, documentId) {
  const documentReference = getDocumentRef(collectionPath, documentId);

  await documentReference.delete();

  return documentResult(documentReference);
}

const createData = createDocument;
const readData = readDocument;
const readCollectionData = readCollection;
const writeData = writeDocument;
const updateData = updateDocument;
const deleteData = deleteDocument;

module.exports = {
  initFirebase,
  getFirebaseApp,
  getFirestoreDb,
  getCollectionRef,
  getDocumentRef,
  createDocument,
  readDocument,
  readCollection,
  writeDocument,
  updateDocument,
  deleteDocument,
  createData,
  readData,
  readCollectionData,
  writeData,
  updateData,
  deleteData,
};
