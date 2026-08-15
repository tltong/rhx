const {
  StudentPracticeAssignment,
} = require("../domain/student_practice_assignment");

class RemoveAssignedPractice {
  constructor(studentPracticeRepository) {
    this.studentPracticeRepository = studentPracticeRepository;
  }

  async execute(input) {
    const assignment = input instanceof StudentPracticeAssignment
      ? input
      : new StudentPracticeAssignment(input);

    await this.studentPracticeRepository.remove(assignment);

    return assignment;
  }
}

module.exports = {
  RemoveAssignedPractice,
};
