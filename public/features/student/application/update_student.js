export class UpdateStudent {
  constructor(studentRepository) {
    this.studentRepository = studentRepository;
  }

  async execute(student, changes) {
    student.update(changes);

    await this.studentRepository.save(student);

    return student;
  }
}
