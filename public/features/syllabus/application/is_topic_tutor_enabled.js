import {requireSyllabusTopic} from "./syllabus_topic_access.js?v=20260730-topic-pre-assessment";

export class IsTopicTutorEnabled {
  constructor(syllabusRepository) {
    this.syllabusRepository = syllabusRepository;
  }

  async execute(syllabusId, topicId) {
    const {topic} = await requireSyllabusTopic(this.syllabusRepository, syllabusId, topicId);
    const enabled = topic.tutorEnabled === undefined ? true : topic.tutorEnabled;
    if (typeof enabled !== "boolean") throw new Error("tutorEnabled must be a boolean.");
    return enabled;
  }
}
