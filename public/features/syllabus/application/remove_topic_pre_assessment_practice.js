import {
  requireSyllabusTopic
} from "./syllabus_topic_access.js?v=20260730-topic-pre-assessment";

export class RemoveTopicPreAssessmentPractice {
  constructor(syllabusRepository) {
    this.syllabusRepository = syllabusRepository;
  }

  async execute(syllabusId, topicId, language) {
    const { syllabus, topic } = await requireSyllabusTopic(
      this.syllabusRepository,
      syllabusId,
      topicId
    );

    topic.removePreAssessmentPractice(language);
    await this.syllabusRepository.saveTopic(syllabus.id, topic);

    return topic;
  }
}
