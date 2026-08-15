const {
  PracticeSession,
} = require("../domain/practice_session");

function requireFunction(value, name) {
  if (typeof value !== "function") {
    throw new Error(`${name} must be a function.`);
  }

  return value;
}

function requireIdentifier(value, fieldName) {
  const identifier = String(value ?? "").trim();

  if (!identifier) {
    throw new Error(`${fieldName} is required.`);
  }

  return identifier;
}

class StartPracticeSession {
  constructor({
    getPracticeById,
    getAssignedPractice,
    getPracticeResult,
    questionLoaders,
    now = () => new Date(),
  } = {}) {
    this.getPracticeById = requireFunction(
      getPracticeById,
      "getPracticeById",
    );
    this.getAssignedPractice = requireFunction(
      getAssignedPractice,
      "getAssignedPractice",
    );
    this.getPracticeResult = requireFunction(
      getPracticeResult,
      "getPracticeResult",
    );

    if (!questionLoaders || typeof questionLoaders !== "object") {
      throw new Error("questionLoaders is required.");
    }

    this.questionLoaders = Object.fromEntries(
      Object.entries(questionLoaders).map(([type, loader]) => [
        type,
        requireFunction(loader, `questionLoaders.${type}`),
      ]),
    );
    this.now = requireFunction(now, "now");
  }

  async execute({practiceId, studentId} = {}) {
    const normalizedPracticeId = requireIdentifier(
      practiceId,
      "practiceId",
    );
    const normalizedStudentId = requireIdentifier(studentId, "studentId");
    const [practice, assignment, existingResult] = await Promise.all([
      this.getPracticeById(normalizedPracticeId),
      this.getAssignedPractice({
        studentId: normalizedStudentId,
        practiceId: normalizedPracticeId,
      }),
      this.getPracticeResult({
        studentId: normalizedStudentId,
        practiceId: normalizedPracticeId,
      }),
    ]);

    if (!practice) {
      throw new Error(`Practice ${normalizedPracticeId} was not found.`);
    }

    if (!assignment) {
      throw new Error("This practice is not assigned to the student.");
    }

    if (existingResult) {
      throw new Error("This practice has already been completed.");
    }

    const loadQuestions = this.questionLoaders[practice.type];

    if (!loadQuestions) {
      throw new Error(
        `No question loader is configured for practice type: ${practice.type}.`,
      );
    }

    const questions = await loadQuestions(practice.questions);

    if (questions.length !== practice.questions.length) {
      throw new Error("Practice questions could not all be loaded.");
    }

    return new PracticeSession({
      practiceId: normalizedPracticeId,
      studentId: normalizedStudentId,
      practiceType: practice.type,
      questions,
      startedAt: this.now(),
    });
  }
}

module.exports = {
  StartPracticeSession,
};
