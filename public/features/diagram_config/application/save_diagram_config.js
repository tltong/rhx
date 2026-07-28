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

function requireTopicConfigs(topicConfigs) {
  if (!Array.isArray(topicConfigs)) {
    throw new Error("topicConfigs must be an array.");
  }

  return topicConfigs;
}

export class SaveDiagramConfig {
  constructor({
    diagramConfigRepository,
    getSyllabusById
  }) {
    this.diagramConfigRepository = diagramConfigRepository;
    this.getSyllabusById = getSyllabusById;
  }

  async execute(syllabusId, topicConfigs) {
    const syllabus = requireSyllabus(
      await this.getSyllabusById(syllabusId),
      syllabusId
    );
    const syllabusTopics = new Map(
      syllabus.topics.map((topic) => [topic.id, topic])
    );
    const submittedTopics = new Map();

    requireTopicConfigs(topicConfigs).forEach((topicConfig) => {
      const topic = new DiagramTopicConfig(topicConfig);

      if (!syllabusTopics.has(topic.topicId)) {
        throw new Error(
          `Topic ${topic.topicId} does not belong to the selected syllabus.`
        );
      }

      if (submittedTopics.has(topic.topicId)) {
        throw new Error(`Topic ${topic.topicId} was submitted more than once.`);
      }

      if (
        topic.isDiagramApplicable
        && topic.diagramQuestionPercentage < 1
      ) {
        throw new Error(
          `${syllabusTopics.get(topic.topicId).topicName} requires a percentage between 1 and 100.`
        );
      }

      submittedTopics.set(topic.topicId, topic);
    });

    const config = new DiagramConfig({
      syllabusId: syllabus.id,
      topics: syllabus.topics.map((syllabusTopic) => {
        const submittedTopic = submittedTopics.get(syllabusTopic.id);

        return new DiagramTopicConfig({
          topicId: syllabusTopic.id,
          topicName: syllabusTopic.topicName,
          isDiagramApplicable:
            submittedTopic?.isDiagramApplicable || false,
          diagramQuestionPercentage:
            submittedTopic?.diagramQuestionPercentage || 0
        });
      })
    });

    await this.diagramConfigRepository.save(config);

    return {
      syllabus,
      config
    };
  }
}
