import {validateTopicFrameworks} from "./validate_topic_frameworks.js?v=20261018-topic-framework-v1";
export class UpdateSyllabus {
  constructor(syllabusRepository, {getAssessmentFrameworkById} = {}) {
    this.getAssessmentFrameworkById = getAssessmentFrameworkById;
    this.syllabusRepository = syllabusRepository;
  }

  async execute(syllabus, changes) {
    syllabus.update(changes);

    await validateTopicFrameworks(syllabus, this.getAssessmentFrameworkById);
    await this.syllabusRepository.save(syllabus);

    return syllabus;
  }
}
