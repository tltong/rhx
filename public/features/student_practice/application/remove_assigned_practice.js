import {
  StudentPracticeAssignment
} from "../domain/student_practice_assignment.js?v=20260808-practice-session";

export class RemoveAssignedPractice {
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
