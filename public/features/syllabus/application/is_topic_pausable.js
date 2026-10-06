import {
  requireSyllabusTopic
} from "./syllabus_topic_access.js?v=20260730-topic-pre-assessment";

export class IsTopicPausable {
  constructor(syllabusRepository) {
    this.syllabusRepository = syllabusRepository;
  }

  async execute(syllabusId, topicId) {
    const {topic} = await requireSyllabusTopic(
      this.syllabusRepository,
      syllabusId,
      topicId
    );
    const pausable = topic.pausable === undefined ? true : topic.pausable;

    if (typeof pausable !== "boolean") {
      throw new Error("pausable must be a boolean.");
    }

    return pausable;
  }
}
