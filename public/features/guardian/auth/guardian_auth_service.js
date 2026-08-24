import {
  getCurrentFirebaseAuthUser,
  getFirebaseAuth,
  onFirebaseAuthStateChanged,
  requireCurrentFirebaseAuthUser
} from "../../../utils/firebase/firebase_auth.js";
import { getFirebaseEmailAuth } from "../../../utils/firebase/firebase_email_auth.js";
import { getFirebaseGoogleAuth } from "../../../utils/firebase/firebase_google_auth.js";

export class GuardianAuthService {
  constructor({ emailAuth = null, googleAuth = null } = {}) {
    this.emailAuth = emailAuth;
    this.googleAuth = googleAuth;
  }

  getEmailAuth() {
    return this.emailAuth || getFirebaseEmailAuth();
  }

  getGoogleAuth() {
    return this.googleAuth || getFirebaseGoogleAuth();
  }

  async signUpWithEmail({ email, password, displayName }) {
    return this.getEmailAuth().create(email, password, { displayName });
  }

  async signUpWithGoogle() {
    return this.getGoogleAuth().create({
      customParameters: { prompt: "select_account" }
    });
  }

  async signInWithEmail({ email, password }) {
    return this.getEmailAuth().signIn(email, password);
  }

  async signInWithGoogle() {
    return this.getGoogleAuth().signIn({
      customParameters: { prompt: "select_account" }
    });
  }

  async deleteEmailAccount() {
    return this.getEmailAuth().delete();
  }

  async deleteGoogleAccount() {
    return this.getGoogleAuth().delete();
  }

  async signOut() {
    await getFirebaseAuth().signOut();

    return { signedOut: true };
  }

  getCurrentUser() {
    return getCurrentFirebaseAuthUser();
  }

  requireCurrentUser() {
    return requireCurrentFirebaseAuthUser();
  }

  onAuthStateChanged(callback) {
    return onFirebaseAuthStateChanged(callback);
  }
}
