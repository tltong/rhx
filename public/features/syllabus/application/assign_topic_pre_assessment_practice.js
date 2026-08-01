import {
  requireSyllabusLanguage,
  requireSyllabusTopic
} from "./syllabus_topic_access.js?v=20260730-topic-pre-assessment";

export class AssignTopicPreAssessmentPractice {
  constructor(syllabusRepository) {
    this.syllabusRepository = syllabusRepository;
  }

  async execute(syllabusId, topicId, language, practiceId) {
    const { syllabus, topic } = await requireSyllabusTopic(
      this.syllabusRepository,
      syllabusId,
      topicId
    );
    const selectedLanguage = requireSyllabusLanguage(syllabus, language);
    const assignment = topic.assignPreAssessmentPractice(
      selectedLanguage,
      practiceId
    );

    await this.syllabusRepository.saveTopic(syllabus.id, topic);

    return assignment;
  }
}
