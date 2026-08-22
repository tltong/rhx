function requireIdentifier(value, fieldName) {
  const identifier = String(value ?? "").trim();

  if (!identifier) {
    throw new Error(`${fieldName} is required.`);
  }

  return identifier;
}

class ListAssignedPracticeIds {
  constructor(studentPracticeRepository) {
    this.studentPracticeRepository = studentPracticeRepository;
  }

  async execute({ studentId } = {}) {
    return this.studentPracticeRepository.listAssignedIds(
      requireIdentifier(studentId, "studentId"),
    );
  }
}

module.exports = {
  ListAssignedPracticeIds,
};
