import {
  PracticeSession
} from "../domain/practice_session.js?v=20260808-practice-session";

function requireFunction(value, name) {
  if (typeof value !== "function") {
    throw new Error(`${name} must be a function.`);
  }

  return value;
}

export class SubmitPracticeSession {
  constructor({
    submitPracticeResult,
    getPracticeResult,
    completeAssignedPractice,
    now = () => new Date()
  } = {}) {
    this.submitPracticeResult = requireFunction(
      submitPracticeResult,
      "submitPracticeResult"
    );
    this.getPracticeResult = requireFunction(
      getPracticeResult,
      "getPracticeResult"
    );
    this.completeAssignedPractice = requireFunction(
      completeAssignedPractice,
      "completeAssignedPractice"
    );
    this.now = requireFunction(now, "now");
  }

  async execute(sessionInput) {
    const session = sessionInput instanceof PracticeSession
      ? sessionInput
      : new PracticeSession(sessionInput);
    const resultKey = {
      practiceId: session.practiceId,
      studentId: session.studentId
    };
    const existingResult = await this.getPracticeResult(resultKey);

    if (existingResult) {
      await this.completeAssignedPractice(existingResult);
      return existingResult;
    }

    const practiceResult = await this.submitPracticeResult(
      session.toResultSubmission(this.now())
    );

    await this.completeAssignedPractice(practiceResult);

    return practiceResult;
  }
}
