import {createSyllabusLanguageKey, normalizeTopicFrameworkIds} from "../domain/syllabus.js?v=20261105-topic-framework-v1";

// All syllabus write paths use the same topic/language contract.
export async function validateTopicFrameworks(syllabus, getAssessmentFrameworkById) {
  const languages = new Set(syllabus.languages.map(createSyllabusLanguageKey));
  const frameworks = new Map();
  for (const topic of syllabus.topics) {
    const assignments = normalizeTopicFrameworkIds(topic.assessmentFrameworkIds);
    for (const key of Object.keys(assignments)) {
      if (!languages.has(key)) throw new Error("A topic framework is configured for an unavailable language.");
    }
    for (const key of languages) {
      const id = assignments[key], attached = topic.preAssessmentPractices?.[key];
      if (!id) {
        if (syllabus.active || attached) throw new Error("Select an assessment framework for " + topic.topicName + " / " + key + ".");
        continue;
      }
      if (typeof getAssessmentFrameworkById !== "function") throw new Error("Topic framework validation is required.");
      if (!frameworks.has(id)) frameworks.set(id, await getAssessmentFrameworkById(id));
      const framework = frameworks.get(id);
      if (!framework) throw new Error("Assessment framework " + id + " could not be found.");
      if (attached && (attached.practiceType || "normal") !== (framework.frameworkType || "normal")) throw new Error("The attached practice type does not match the framework for " + topic.topicName + " / " + key + ". Remove the attachment before changing question type.");
    }
  }
}
