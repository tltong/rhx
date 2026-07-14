import { getFirebaseEmailAuth } from "../../../utils/firebase/firebase_email_auth.js";
import {
  getCurrentFirebaseAuthUser,
  onFirebaseAuthStateChanged,
  requireCurrentFirebaseAuthUser
} from "../../../utils/firebase/firebase_auth.js";

export class StudentAuthService {
  constructor(emailAuth = getFirebaseEmailAuth()) {
    this.emailAuth = emailAuth;
  }

  async signUp({
    email,
    password,
    displayName,
    photoURL,
    sendEmailVerification = false
  }) {
    return this.emailAuth.create(email, password, {
      displayName,
      photoURL,
      sendEmailVerification
    });
  }

  async signIn({ email, password }) {
    return this.emailAuth.signIn(email, password);
  }

  async signOut() {
    return this.emailAuth.signOut();
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

  async getIdToken(forceRefresh = false) {
    return this.emailAuth.getIdToken(forceRefresh);
  }
}

export const studentAuthService = new StudentAuthService();
