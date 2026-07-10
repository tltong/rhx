import { firebaseConfig } from "../../config/firebase/firebase_config.js";

let firebaseApp = null;
let firestoreDb = null;

export function getFirebaseNamespace() {
  const firebaseNamespace = globalThis.firebase;

  if (!firebaseNamespace) {
    throw new Error(
      "Firebase SDK is not loaded. Include firebase-app-compat.js and firebase-firestore-compat.js before firebase_ops.js."
    );
  }

  if (typeof firebaseNamespace.initializeApp !== "function") {
    throw new Error("Firebase app compat SDK is not available.");
  }

  if (typeof firebaseNamespace.firestore !== "function") {
    throw new Error("Firebase Firestore compat SDK is not available.");
  }

  return firebaseNamespace;
}

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
    id: snapshot.id
  };
}

function documentResult(docRef) {
  return {
    id: docRef.id,
    path: docRef.path
  };
}

export function initFirebase(config = firebaseConfig) {
  const firebaseNamespace = getFirebaseNamespace();

  if (!firebaseApp) {
    if (Array.isArray(firebaseNamespace.apps) && firebaseNamespace.apps.length > 0) {
      firebaseApp = firebaseNamespace.app();
    } else {
      firebaseApp = firebaseNamespace.initializeApp(config);
    }
  }

  if (!firestoreDb) {
    firestoreDb = typeof firebaseApp.firestore === "function"
      ? firebaseApp.firestore()
      : firebaseNamespace.firestore();
  }

  return {
    app: firebaseApp,
    db: firestoreDb
  };
}

export function getFirebaseApp() {
  return initFirebase().app;
}

export function getFirestoreDb() {
  return initFirebase().db;
}

export function getAvailableFirebaseFeatures() {
  const { app } = initFirebase();
  const features = [
    "auth",
    "database",
    "firestore",
    "functions",
    "messaging",
    "storage",
    "analytics",
    "remoteConfig",
    "performance"
  ];

  return features.filter((feature) => typeof app[feature] === "function");
}

export function getCollectionRef(collectionPath) {
  const path = requireNonEmptyString(collectionPath, "collectionPath");

  return getFirestoreDb().collection(path);
}

export function getDocumentRef(collectionPath, documentId) {
  const collection = getCollectionRef(collectionPath);
  const id = requireNonEmptyString(documentId, "documentId");

  return collection.doc(id);
}

export async function createDocument(collectionPath, data, documentId = null) {
  requireFirestoreData(data);

  const docRef = documentId === null || documentId === undefined
    ? getCollectionRef(collectionPath).doc()
    : getDocumentRef(collectionPath, documentId);

  await docRef.set(data);

  return documentResult(docRef);
}

export async function readDocument(collectionPath, documentId, options = {}) {
  const snapshot = await getDocumentRef(collectionPath, documentId).get();

  return toDocumentData(snapshot, options);
}

export async function readCollection(collectionPath, buildQuery = null, options = {}) {
  const collection = getCollectionRef(collectionPath);
  const query = typeof buildQuery === "function" ? buildQuery(collection) : collection;
  const snapshot = await query.get();

  return snapshot.docs.map((docSnapshot) => toDocumentData(docSnapshot, options));
}

export async function writeDocument(collectionPath, documentId, data, options = { merge: true }) {
  requireFirestoreData(data);

  const docRef = getDocumentRef(collectionPath, documentId);

  await docRef.set(data, options);

  return documentResult(docRef);
}

export async function updateDocument(collectionPath, documentId, data) {
  requireFirestoreData(data);

  const docRef = getDocumentRef(collectionPath, documentId);

  await docRef.update(data);

  return documentResult(docRef);
}

export async function deleteDocument(collectionPath, documentId) {
  const docRef = getDocumentRef(collectionPath, documentId);

  await docRef.delete();

  return documentResult(docRef);
}

export const createData = createDocument;
export const readData = readDocument;
export const readCollectionData = readCollection;
export const writeData = writeDocument;
export const updateData = updateDocument;
export const deleteData = deleteDocument;

export default {
  initFirebase,
  getFirebaseNamespace,
  getFirebaseApp,
  getFirestoreDb,
  getAvailableFirebaseFeatures,
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
  deleteData
};
