import {
  Syllabus
} from "../domain/syllabus.js?v=20261004-topic-pausable-v1";

export class CreateSyllabus {
  constructor(syllabusRepository) {
    this.syllabusRepository = syllabusRepository;
  }

  async execute(data) {
    const syllabus = new Syllabus(data);

    await this.syllabusRepository.save(syllabus);

    return syllabus;
  }
}
