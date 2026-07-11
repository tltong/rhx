import { getFirebaseApp } from "./firebase_ops.js";

let firebaseAuth = null;

export function getFirebaseAuth() {
  const app = getFirebaseApp();

  if (!app || typeof app.auth !== "function") {
    throw new Error(
      "Firebase Auth SDK is not available. Include firebase-auth-compat.js before using firebase_auth.js."
    );
  }

  if (!firebaseAuth) {
    firebaseAuth = app.auth();
  }

  return firebaseAuth;
}

export function toFirebaseUserData(user = getFirebaseAuth().currentUser) {
  if (!user) {
    return null;
  }

  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
    emailVerified: user.emailVerified,
    isAnonymous: user.isAnonymous,
    providerId: user.providerId,
    providerData: user.providerData,
    metadata: {
      creationTime: user.metadata?.creationTime || null,
      lastSignInTime: user.metadata?.lastSignInTime || null
    }
  };
}

export function getCurrentFirebaseAuthUser() {
  return toFirebaseUserData(getFirebaseAuth().currentUser);
}

export function getCurrentFirebaseAuthRawUser() {
  return getFirebaseAuth().currentUser;
}

export function requireCurrentFirebaseAuthUser() {
  const user = getCurrentFirebaseAuthUser();

  if (!user) {
    throw new Error("No authenticated user is currently signed in.");
  }

  return user;
}

export function requireCurrentFirebaseAuthRawUser() {
  const user = getCurrentFirebaseAuthRawUser();

  if (!user) {
    throw new Error("No authenticated user is currently signed in.");
  }

  return user;
}

export function onFirebaseAuthStateChanged(callback) {
  if (typeof callback !== "function") {
    throw new Error("callback must be a function.");
  }

  return getFirebaseAuth().onAuthStateChanged((user) => {
    callback(toFirebaseUserData(user), user);
  });
}

export default {
  getFirebaseAuth,
  toFirebaseUserData,
  getCurrentFirebaseAuthUser,
  getCurrentFirebaseAuthRawUser,
  requireCurrentFirebaseAuthUser,
  requireCurrentFirebaseAuthRawUser,
  onFirebaseAuthStateChanged
};
