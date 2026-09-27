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

  async acceptAdditionalDailyMission(input) {
    const callable = this.getFunctions().httpsCallable(
      "acceptAdditionalDailyMission"
    );
    const response = await callable(input);

    return response?.data;
  }

  async acceptCoreDailyMission(input) {
    const callable = this.getFunctions().httpsCallable(
      "acceptCoreDailyMission"
    );
    const response = await callable(input);

    return response?.data;
  }

  async checkPausedTopicValidity(input) {
    const callable = this.getFunctions().httpsCallable(
      "checkPausedTopicValidity"
    );
    const response = await callable(input);

    return response?.data;
  }

  async getNextCoreDailyMission(input) {
    const callable = this.getFunctions().httpsCallable(
      "getNextCoreDailyMission"
    );
    const response = await callable(input);

    return response?.data ?? null;
  }

  async listAdditionalMissionPracticeIds(input) {
    const callable = this.getFunctions().httpsCallable(
      "listAdditionalMissionPracticeIds"
    );
    const response = await callable(input);

    return response?.data;
  }

  async pauseCoreDailyMission(input) {
    const callable = this.getFunctions().httpsCallable(
      "pauseCoreDailyMission"
    );
    const response = await callable(input);

    return response?.data;
  }
}
