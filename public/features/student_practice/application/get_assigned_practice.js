import {
  StudentPracticeAssignment
} from "../domain/student_practice_assignment.js?v=20260808-practice-session";

export class GetAssignedPractice {
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
