import { toStudentSummary } from "../domain/student_summary.js";

export class GetStudentSummary {
  constructor(studentRepository, now = () => new Date()) {
    this.studentRepository = studentRepository;
    this.now = now;
  }

  async execute(studentId) {
    const student = await this.studentRepository.getById(studentId);

    return student ? toStudentSummary(student, this.now) : null;
  }
}
