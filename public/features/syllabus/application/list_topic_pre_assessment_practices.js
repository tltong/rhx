import {
  requireSyllabusTopic
} from "./syllabus_topic_access.js?v=20260730-topic-pre-assessment";

export class ListTopicPreAssessmentPractices {
  constructor(syllabusRepository) {
    this.syllabusRepository = syllabusRepository;
  }

  async execute(syllabusId, topicId) {
    const { topic } = await requireSyllabusTopic(
      this.syllabusRepository,
      syllabusId,
      topicId
    );

    return topic.listPreAssessmentPractices()
      .sort((first, second) => first.language.localeCompare(second.language));
  }
}
