import { getFirebaseApp } from "./firebase_ops.js";

function requireNonEmptyString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} must be a non-empty string.`);
  }

  return value.trim();
}

function hasOwnValue(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

export class FirebaseEmailAuth {
  constructor(app = getFirebaseApp()) {
    if (!app || typeof app.auth !== "function") {
      throw new Error(
        "Firebase Auth SDK is not available. Include firebase-auth-compat.js before using FirebaseEmailAuth."
      );
    }

    this.auth = app.auth();
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

  async create(email, password, profile = {}) {
    const userEmail = requireNonEmptyString(email, "email");
    const userPassword = requireNonEmptyString(password, "password");
    const credential = await this.auth.createUserWithEmailAndPassword(userEmail, userPassword);
    const user = credential.user;

    if (profile && (hasOwnValue(profile, "displayName") || hasOwnValue(profile, "photoURL"))) {
      await user.updateProfile({
        displayName: profile.displayName,
        photoURL: profile.photoURL
      });
    }

    if (profile?.sendEmailVerification === true) {
      await user.sendEmailVerification();
    }

    await user.reload();

    return this.toUserData(this.auth.currentUser);
  }

  read() {
    return this.toUserData();
  }

  async signIn(email, password) {
    const userEmail = requireNonEmptyString(email, "email");
    const userPassword = requireNonEmptyString(password, "password");
    const credential = await this.auth.signInWithEmailAndPassword(userEmail, userPassword);

    return this.toUserData(credential.user);
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

    if (hasOwnValue(updates, "email")) {
      await user.updateEmail(requireNonEmptyString(updates.email, "email"));
    }

    if (hasOwnValue(updates, "password")) {
      await user.updatePassword(requireNonEmptyString(updates.password, "password"));
    }

    if (updates.sendEmailVerification === true) {
      await user.sendEmailVerification();
    }

    await user.reload();

    return this.toUserData(this.auth.currentUser);
  }

  async sendPasswordReset(email) {
    const userEmail = requireNonEmptyString(email, "email");

    await this.auth.sendPasswordResetEmail(userEmail);

    return {
      email: userEmail,
      sent: true
    };
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

let defaultEmailAuth = null;

export function getFirebaseEmailAuth() {
  if (!defaultEmailAuth) {
    defaultEmailAuth = new FirebaseEmailAuth();
  }

  return defaultEmailAuth;
}

export default FirebaseEmailAuth;
