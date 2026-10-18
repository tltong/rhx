import {createSyllabusLanguageKey, normalizeTopicFrameworkIds} from "../domain/syllabus.js?v=20261018-topic-framework-v1";

export async function validateTopicFrameworks(syllabus, getAssessmentFrameworkById) {
  const languages = new Set(syllabus.languages.map(createSyllabusLanguageKey));
  const ids = new Set();
  for (const topic of syllabus.topics) {
    for (const [key, id] of Object.entries(normalizeTopicFrameworkIds(topic.assessmentFrameworkIds))) {
      if (!languages.has(key)) throw new Error("A topic framework is configured for an unavailable language.");
      ids.add(id);
    }
  }
  if (!ids.size) return;
  if (typeof getAssessmentFrameworkById !== "function") throw new Error("Framework validation is required for topic overrides.");
  for (const id of ids) if (!await getAssessmentFrameworkById(id)) throw new Error("Assessment framework " + id + " could not be found.");
}
