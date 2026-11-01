import {watchStudentSubscriptionAccess} from "../../syllabus_subscription/student_access_module.js?v=20261031-subscription-cancel-v1";
import {watchStudentBillingGate} from "./student_billing_gate.js?v=20261031-renewal-restart-v1";
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
    // Account creation/sign-in must finish before the learning-page gate runs.
    if (/\/features\/student\/pages\/(sign_in|sign_up)\//.test(globalThis.location?.pathname || "")) {
      return onFirebaseAuthStateChanged(callback);
    }
    return watchStudentBillingGate({observeAuth: onFirebaseAuthStateChanged, observeAccess: watchStudentSubscriptionAccess,
      callback, redirect: reason => globalThis.location?.replace(
        "/features/student/pages/subscription_suspended/subscription_suspended.html?reason=" + encodeURIComponent(reason))});
  }

  async getIdToken(forceRefresh = false) {
    return this.emailAuth.getIdToken(forceRefresh);
  }
}

let defaultStudentAuthService = null;

export function getStudentAuthService() {
  if (!defaultStudentAuthService) {
    defaultStudentAuthService = new StudentAuthService();
  }

  return defaultStudentAuthService;
}
