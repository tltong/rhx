import {
  PracticeSession
} from "../domain/practice_session.js?v=20260808-practice-session";

export class CurrentPracticeSession {
  constructor() {
    this.session = null;
  }

  set(sessionInput) {
    this.session = sessionInput instanceof PracticeSession
      ? sessionInput
      : new PracticeSession(sessionInput);

    return this.session;
  }

  require() {
    if (!this.session) {
      throw new Error("No practice session is currently loaded.");
    }

    return this.session;
  }

  get() {
    return this.session;
  }

  clear() {
    this.session = null;
  }
}
