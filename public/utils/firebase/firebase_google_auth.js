import { getFirebaseApp } from "./firebase_ops.js";

export const GOOGLE_PROVIDER_ID = "google.com";

function hasOwnValue(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function getFirebaseNamespace() {
  const firebaseNamespace = globalThis.firebase;

  if (!firebaseNamespace) {
    throw new Error(
      "Firebase SDK is not loaded. Include firebase-app-compat.js and firebase-auth-compat.js before firebase_google_auth.js."
    );
  }

  return firebaseNamespace;
}

function createGoogleProvider(options = {}) {
  const firebaseNamespace = getFirebaseNamespace();

  if (!firebaseNamespace.auth?.GoogleAuthProvider) {
    throw new Error(
      "Google Auth provider is not available. Include firebase-auth-compat.js before using FirebaseGoogleAuth."
    );
  }

  const provider = new firebaseNamespace.auth.GoogleAuthProvider();
  const scopes = Array.isArray(options.scopes) ? options.scopes : [];
  const customParameters = options.customParameters || {};

  scopes.forEach((scope) => provider.addScope(scope));

  if (Object.keys(customParameters).length > 0) {
    provider.setCustomParameters(customParameters);
  }

  return provider;
}

export class FirebaseGoogleAuth {
  constructor(app = getFirebaseApp(), providerOptions = {}) {
    if (!app || typeof app.auth !== "function") {
      throw new Error(
        "Firebase Auth SDK is not available. Include firebase-auth-compat.js before using FirebaseGoogleAuth."
      );
    }

    this.auth = app.auth();
    this.providerOptions = providerOptions;
  }

  getProvider(options = {}) {
    return createGoogleProvider({
      ...this.providerOptions,
      ...options,
      scopes: options.scopes || this.providerOptions.scopes,
      customParameters: {
        ...(this.providerOptions.customParameters || {}),
        ...(options.customParameters || {})
      }
    });
  }

  toUserData(user = this.auth.currentUser) {
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

  toAuthResult(result) {
    return {
      user: this.toUserData(result?.user || null),
      additionalUserInfo: result?.additionalUserInfo
        ? {
            isNewUser: result.additionalUserInfo.isNewUser,
            providerId: result.additionalUserInfo.providerId,
            username: result.additionalUserInfo.username || null
          }
        : null
    };
  }

  requireCurrentUser() {
    const user = this.auth.currentUser;

    if (!user) {
      throw new Error("No authenticated user is currently signed in.");
    }

    return user;
  }

  onAuthStateChanged(callback) {
    if (typeof callback !== "function") {
      throw new Error("callback must be a function.");
    }

    return this.auth.onAuthStateChanged((user) => {
      callback(this.toUserData(user), user);
    });
  }

  async create(options = {}) {
    return this.signInWithPopup(options);
  }

  read() {
    return this.toUserData();
  }

  async signIn(options = {}) {
    return this.signInWithPopup(options);
  }

  async signInWithPopup(options = {}) {
    const result = await this.auth.signInWithPopup(this.getProvider(options));

    return this.toAuthResult(result);
  }

  async signInWithRedirect(options = {}) {
    await this.auth.signInWithRedirect(this.getProvider(options));

    return { redirectStarted: true };
  }

  async getRedirectResult() {
    const result = await this.auth.getRedirectResult();

    return this.toAuthResult(result);
  }

  async signOut() {
    await this.auth.signOut();

    return { signedOut: true };
  }

  async reload() {
    const user = this.requireCurrentUser();

    await user.reload();

    return this.toUserData(this.auth.currentUser);
  }

  async getIdToken(forceRefresh = false) {
    const user = this.requireCurrentUser();

    return user.getIdToken(forceRefresh);
  }

  async update(updates = {}) {
    const user = this.requireCurrentUser();

    if (hasOwnValue(updates, "displayName") || hasOwnValue(updates, "photoURL")) {
      await user.updateProfile({
        displayName: updates.displayName,
        photoURL: updates.photoURL
      });
    }

    await user.reload();

    return this.toUserData(this.auth.currentUser);
  }

  async linkCurrentUserWithGoogle(options = {}) {
    const user = this.requireCurrentUser();
    const result = await user.linkWithPopup(this.getProvider(options));

    return this.toAuthResult(result);
  }

  async unlinkGoogle() {
    const user = this.requireCurrentUser();

    await user.unlink(GOOGLE_PROVIDER_ID);
    await user.reload();

    return this.toUserData(this.auth.currentUser);
  }

  async delete() {
    const user = this.requireCurrentUser();
    const uid = user.uid;
    const email = user.email;

    await user.delete();

    return {
      uid,
      email,
      deleted: true
    };
  }
}

let defaultGoogleAuth = null;

export function getFirebaseGoogleAuth(providerOptions = {}) {
  if (!defaultGoogleAuth) {
    defaultGoogleAuth = new FirebaseGoogleAuth(undefined, providerOptions);
  }

  return defaultGoogleAuth;
}

export default FirebaseGoogleAuth;
