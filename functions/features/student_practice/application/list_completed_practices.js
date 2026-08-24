function requireIdentifier(value, fieldName) {
  const identifier = String(value ?? "").trim();

  if (!identifier) {
    throw new Error(`${fieldName} is required.`);
  }

  return identifier;
}

class ListCompletedPractices {
  constructor(studentPracticeRepository) {
    this.studentPracticeRepository = studentPracticeRepository;
  }

  async execute({ studentId } = {}) {
    return this.studentPracticeRepository.listCompleted(
      requireIdentifier(studentId, "studentId"),
    );
  }
}

module.exports = {
  ListCompletedPractices,
};
