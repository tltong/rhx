export class GetStudent {
  constructor(studentRepository) {
    this.studentRepository = studentRepository;
  }

  async execute(studentId) {
    return this.studentRepository.getById(studentId);
  }
}
