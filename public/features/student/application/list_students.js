export class ListStudents {
  constructor(studentRepository) {
    this.studentRepository = studentRepository;
  }

  async execute() {
    return this.studentRepository.list();
  }
}
