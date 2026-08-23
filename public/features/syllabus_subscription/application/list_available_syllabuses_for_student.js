function requireText(value, fieldName) {
  const text = String(value ?? "").trim();

  if (!text) {
    throw new Error(`${fieldName} is required.`);
  }

  return text;
}

function requirePositiveInteger(value, fieldName) {
  const number = Number(value);

  if (!Number.isInteger(number) || number < 1) {
    throw new Error(`${fieldName} must be a positive integer.`);
  }

  return number;
}

function resolveCurrentStudentYear(student, now) {
  const registrationYear = requirePositiveInteger(
    student.yearOfRegistration,
    "yearOfRegistration"
  );
  const startingYear = requirePositiveInteger(
    student.standardAtYearOfRegistration,
    "standardAtYearOfRegistration"
  );
  const currentDate = now();

  if (!(currentDate instanceof Date) || Number.isNaN(currentDate.getTime())) {
    throw new Error("now must return a valid date.");
  }

  const elapsedYears = currentDate.getFullYear() - registrationYear;

  if (elapsedYears < 0) {
    throw new Error("yearOfRegistration cannot be in the future.");
  }

  return startingYear + elapsedYears;
}

function scopesMatch(student, stream) {
  return requireText(student.country, "student country").localeCompare(
    requireText(stream.country, "stream country"),
    undefined,
    { sensitivity: "accent" }
  ) === 0
    && requireText(student.level, "student level").toLowerCase()
      === requireText(stream.level, "stream level").toLowerCase();
}

export class ListAvailableSyllabusesForStudent {
  constructor({
    getStudentById,
    getStudentStreamSubscription,
    getStreamById,
    now = () => new Date()
  }) {
    this.getStudentById = getStudentById;
    this.getStudentStreamSubscription = getStudentStreamSubscription;
    this.getStreamById = getStreamById;
    this.now = now;
  }

  async execute(studentId) {
    const selectedStudentId = requireText(studentId, "studentId");
    const student = await this.getStudentById(selectedStudentId);

    if (!student) {
      throw new Error("Student could not be found.");
    }

    const streamSubscription = await this.getStudentStreamSubscription(
      selectedStudentId
    );

    if (!streamSubscription) {
      return [];
    }

    const stream = await this.getStreamById(streamSubscription.streamId);

    if (!stream) {
      throw new Error("The student's subscribed stream could not be found.");
    }

    if (!scopesMatch(student, stream)) {
      throw new Error("The student and subscribed stream scopes do not match.");
    }

    const studentYear = resolveCurrentStudentYear(student, this.now);
    const yearAssignment = stream.getYearAssignment(studentYear);

    if (!yearAssignment) {
      return [];
    }

    return yearAssignment.syllabuses
      .map(({ syllabusId, language }) => ({
        syllabusId: requireText(syllabusId, "syllabusId"),
        language: requireText(language, "language")
      }))
      .sort((first, second) => (
        first.syllabusId.localeCompare(second.syllabusId)
      ));
  }
}
