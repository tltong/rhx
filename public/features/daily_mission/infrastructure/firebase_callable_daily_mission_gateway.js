import {
  getFirebaseApp
} from "../../../utils/firebase/firebase_ops.js";
import {
  DailyMissionGateway
} from "../domain/daily_mission_gateway.js";

const FIREBASE_FUNCTIONS_REGION = "us-central1";

export class FirebaseCallableDailyMissionGateway
  extends DailyMissionGateway {
  constructor({ getApp = getFirebaseApp } = {}) {
    super();
    this.getApp = getApp;
    this.functions = null;
  }

  getFunctions() {
    if (this.functions) {
      return this.functions;
    }

    const app = this.getApp();

    if (!app || typeof app.functions !== "function") {
      throw new Error(
        "Firebase Functions SDK is not available. Include firebase-functions-compat.js."
      );
    }

    this.functions = app.functions(FIREBASE_FUNCTIONS_REGION);
    return this.functions;
  }

}
