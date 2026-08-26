import {
  getFirebaseApp
} from "../../../utils/firebase/firebase_ops.js";

const FIREBASE_FUNCTIONS_REGION = "us-central1";

export class FirebaseCallableSiteAdminGateway {
  constructor() {
    this.functions = null;
  }

  getFunctions() {
    if (this.functions) {
      return this.functions;
    }

    const app = getFirebaseApp();

    if (!app || typeof app.functions !== "function") {
      throw new Error(
        "Firebase Functions SDK is not available. Include firebase-functions-compat.js."
      );
    }

    this.functions = app.functions(FIREBASE_FUNCTIONS_REGION);
    return this.functions;
  }

  async call(functionName, data = {}) {
    const callable = this.getFunctions().httpsCallable(functionName);
    const response = await callable(data);

    return response?.data || {};
  }

  async listEmails() {
    return this.call("listSiteAdminEmails");
  }

  async addEmail(email) {
    return this.call("addSiteAdminEmail", { email });
  }

  async removeEmail(email) {
    return this.call("removeSiteAdminEmail", { email });
  }

  async getCurrentStatus() {
    return this.call("isCurrentUserSiteAdmin");
  }
}
