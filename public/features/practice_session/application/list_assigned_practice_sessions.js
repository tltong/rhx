function requireFunction(value, name) {
  if (typeof value !== "function") {
    throw new Error(`${name} must be a function.`);
  }

  return value;
}

function compareByDateGenerated(first, second) {
  const firstTime = first.practice?.dateGenerated?.getTime?.() || 0;
  const secondTime = second.practice?.dateGenerated?.getTime?.() || 0;

  return secondTime - firstTime;
}

export class ListAssignedPracticeSessions {
  constructor({ listAssignedPractices, getPracticeById } = {}) {
    this.listAssignedPractices = requireFunction(
      listAssignedPractices,
      "listAssignedPractices"
    );
    this.getPracticeById = requireFunction(
      getPracticeById,
      "getPracticeById"
    );
  }

  async execute({ studentId } = {}) {
    const assignments = await this.listAssignedPractices({ studentId });
    const entries = await Promise.all(assignments.map(async (assignment) => (
      Object.freeze({
        assignment,
        practice: await this.getPracticeById(assignment.practiceId)
      })
    )));

    return Object.freeze(entries.sort(compareByDateGenerated));
  }
}
