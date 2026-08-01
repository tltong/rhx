import {
  Syllabus
} from "../domain/syllabus.js?v=20260730-topic-pre-assessment";

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
