const {
  StudentPracticeAssignment,
} = require("../domain/student_practice_assignment");

function requireFunction(value, name) {
  if (typeof value !== "function") {
    throw new Error(`${name} must be a function.`);
  }

  return value;
}

class AssignPracticeToStudent {
  constructor({
    studentPracticeRepository,
    getPracticeById,
  } = {}) {
    if (!studentPracticeRepository) {
      throw new Error("studentPracticeRepository is required.");
    }

    this.studentPracticeRepository = studentPracticeRepository;
    this.getPracticeById = requireFunction(
      getPracticeById,
      "getPracticeById",
    );
  }

  async execute(input) {
    const assignment = input instanceof StudentPracticeAssignment
      ? input
      : new StudentPracticeAssignment(input);
    const practice = await this.getPracticeById(assignment.practiceId);

    if (!practice) {
      throw new Error(`Practice ${assignment.practiceId} was not found.`);
    }

    return this.studentPracticeRepository.assign(assignment);
  }
}

module.exports = {
  AssignPracticeToStudent,
};
