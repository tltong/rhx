const {
  StudentPracticeAssignment,
} = require("../domain/student_practice_assignment");

class GetAssignedPractice {
  constructor(studentPracticeRepository) {
    this.studentPracticeRepository = studentPracticeRepository;
  }

  async execute(input) {
    const assignment = input instanceof StudentPracticeAssignment
      ? input
      : new StudentPracticeAssignment(input);

    return this.studentPracticeRepository.get(assignment);
  }
}

module.exports = {
  GetAssignedPractice,
};
