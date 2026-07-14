import { Student } from "../domain/student.js?v=20260714-level";

export class CreateStudent {
  constructor(studentRepository) {
    this.studentRepository = studentRepository;
  }

  async execute(data) {
    const student = new Student(data);

    await this.studentRepository.save(student);

    return student;
  }
}
