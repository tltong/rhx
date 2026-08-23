function requireIdentifier(value, fieldName) {
  const identifier = String(value ?? "").trim();

  if (!identifier) {
    throw new Error(`${fieldName} is required.`);
  }

  return identifier;
}

class StreamSubscription {
  constructor({studentId, streamId}) {
    this.studentId = requireIdentifier(studentId, "studentId");
    this.streamId = requireIdentifier(streamId, "streamId");
  }
}

module.exports = {
  StreamSubscription,
};
