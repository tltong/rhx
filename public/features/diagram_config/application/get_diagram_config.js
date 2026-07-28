import {
  DiagramConfig,
  DiagramTopicConfig
} from "../domain/diagram_config.js";

function requireSyllabus(syllabus, syllabusId) {
  if (!syllabus) {
    throw new Error(`Syllabus ${syllabusId} could not be found.`);
  }

  return syllabus;
}

export class GetDiagramConfig {
  constructor({
    diagramConfigRepository,
    getSyllabusById
  }) {
    this.diagramConfigRepository = diagramConfigRepository;
    this.getSyllabusById = getSyllabusById;
  }

  async execute(syllabusId) {
    const syllabus = requireSyllabus(
      await this.getSyllabusById(syllabusId),
      syllabusId
    );
    const storedConfig = await this.diagramConfigRepository.getBySyllabusId(
      syllabus.id
    );
    const storedTopics = new Map(
      (storedConfig?.topics || []).map((topic) => [topic.topicId, topic])
    );
    const topics = syllabus.topics.map((topic) => {
      const storedTopic = storedTopics.get(topic.id);

      return new DiagramTopicConfig({
        topicId: topic.id,
        topicName: topic.topicName,
        isDiagramApplicable: storedTopic?.isDiagramApplicable,
        diagramQuestionPercentage:
          storedTopic?.diagramQuestionPercentage
      });
    });

    return {
      syllabus,
      config: new DiagramConfig({
        syllabusId: syllabus.id,
        topics
      })
    };
  }
}
