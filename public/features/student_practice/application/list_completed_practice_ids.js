function requireIdentifier(value, fieldName) {
  const identifier = String(value ?? "").trim();

  if (!identifier) {
    throw new Error(`${fieldName} is required.`);
  }

  return identifier;
}

export class ListCompletedPracticeIds {
  constructor(studentPracticeRepository) {
    this.studentPracticeRepository = studentPracticeRepository;
  }

  async execute({ studentId } = {}) {
    return this.studentPracticeRepository.listCompletedIds(
      requireIdentifier(studentId, "studentId")
    );
  }
}
