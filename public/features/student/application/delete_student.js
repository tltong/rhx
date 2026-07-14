export class DeleteStudent {
  constructor(studentRepository) {
    this.studentRepository = studentRepository;
  }

  async execute(studentId) {
    await this.studentRepository.delete(studentId);
  }
}
