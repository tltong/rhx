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

function valuesMatch(first, second) {
  return requireText(first, "student scope value").localeCompare(
    requireText(second, "stream scope value"),
    undefined,
    { sensitivity: "accent" }
  ) === 0;
}

export class SubscribeStudentToStreamSyllabuses {
  constructor({
    getStudentAcademicScope,
    getStreamById,
    subscribeStudentToStream,
    subscribeSyllabus
  }) {
    this.getStudentAcademicScope = getStudentAcademicScope;
    this.getStreamById = getStreamById;
    this.subscribeStudentToStream = subscribeStudentToStream;
    this.subscribeSyllabus = subscribeSyllabus;
  }

  async execute(studentId, streamId) {
    const selectedStudentId = requireText(studentId, "studentId");
    const selectedStreamId = requireText(streamId, "streamId");
    const [studentScope, stream] = await Promise.all([
      this.getStudentAcademicScope(selectedStudentId),
      this.getStreamById(selectedStreamId)
    ]);

    if (!studentScope) {
      throw new Error("Student could not be found.");
    }

    if (!stream) {
      throw new Error("Stream could not be found.");
    }

    if (
      !valuesMatch(studentScope.country, stream.country)
      || !valuesMatch(studentScope.level, stream.level)
    ) {
      throw new Error("The student and stream scopes do not match.");
    }

    const year = requirePositiveInteger(studentScope.year, "student year");
    const yearAssignment = stream.getYearAssignment(year);
    const assignments = (yearAssignment?.syllabuses || []).map((assignment) => ({
      syllabusId: requireText(assignment.syllabusId, "syllabusId"),
      language: requireText(assignment.language, "language")
    }));

    const streamSubscription = await this.subscribeStudentToStream(
      selectedStudentId,
      selectedStreamId
    );
    const syllabusSubscriptions = await Promise.all(
      assignments.map(({ syllabusId, language }) => this.subscribeSyllabus(
        selectedStudentId,
        syllabusId,
        language
      ))
    );

    return {
      studentId: selectedStudentId,
      streamId: selectedStreamId,
      country: studentScope.country,
      level: studentScope.level,
      year,
      streamSubscription,
      syllabusSubscriptions
    };
  }
}
