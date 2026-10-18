import {validateTopicFrameworks} from "./validate_topic_frameworks.js?v=20261018-topic-framework-v1";
import {
  Syllabus
} from "../domain/syllabus.js?v=20261018-topic-framework-v1";

export class CreateSyllabus {
  constructor(syllabusRepository, {getAssessmentFrameworkById} = {}) {
    this.getAssessmentFrameworkById = getAssessmentFrameworkById;
    this.syllabusRepository = syllabusRepository;
  }

  async execute(data) {
    const syllabus = new Syllabus(data);

    await validateTopicFrameworks(syllabus, this.getAssessmentFrameworkById);
    await this.syllabusRepository.save(syllabus);

    return syllabus;
  }
}
