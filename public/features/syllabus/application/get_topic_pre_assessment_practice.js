import {
  requireSyllabusLanguage,
  requireSyllabusTopic
} from "./syllabus_topic_access.js?v=20260730-topic-pre-assessment";

export class GetTopicPreAssessmentPractice {
  constructor(syllabusRepository) {
    this.syllabusRepository = syllabusRepository;
  }

  async execute(syllabusId, topicId, language) {
    const { syllabus, topic } = await requireSyllabusTopic(
      this.syllabusRepository,
      syllabusId,
      topicId
    );
    const selectedLanguage = requireSyllabusLanguage(syllabus, language);

    return topic.getPreAssessmentPractice(selectedLanguage);
  }
}
