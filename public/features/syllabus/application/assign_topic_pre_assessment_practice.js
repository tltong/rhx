import {preAssessmentPracticeTypes} from "../../../config/firebase/syllabuses_schema.js?v=20261105-topic-framework-v1";
import {SyllabusTopicPreAssessmentPractice, resolveTopicAssessmentFrameworkId} from "../domain/syllabus.js?v=20261105-topic-framework-v1";

class AssignTopicPreAssessmentPractice {
  constructor(syllabusRepository, {getAssessmentFrameworkById} = {}) {Object.assign(this, {syllabusRepository, getAssessmentFrameworkById});}
  async execute(syllabusId, topicId, language, practiceId, practiceType = preAssessmentPracticeTypes.NORMAL, {assertAccess = () => {}} = {}) {
    for (const [name, value] of Object.entries({syllabusId, topicId, practiceId})) {
      if (typeof value !== "string" || !value.trim() || value.includes("/") || [".", ".."].includes(value.trim())) {
        throw new Error(name + " must be a valid document identifier.");
      }
    }
    if (!Object.values(preAssessmentPracticeTypes).includes(practiceType)) throw new Error("Unknown topic practice type.");
    assertAccess();
    const syllabus = await this.syllabusRepository.getById(syllabusId.trim());
    assertAccess();
    if (!syllabus) throw new Error("Syllabus could not be found.");
    const topic = syllabus.topics.find(item => item.id === topicId.trim());
    if (!topic) throw new Error("Syllabus topic could not be found.");
    const selectedLanguage = syllabus.languages.find(item =>
      item.toLowerCase() === String(language ?? "").trim().toLowerCase());
    if (!selectedLanguage) throw new Error("Language is not available for the syllabus.");
    const frameworkId = resolveTopicAssessmentFrameworkId(syllabus, {topicId: topic.id, language: selectedLanguage});
    if (!frameworkId) throw new Error("Select an assessment framework for this topic and language before attaching a practice.");
    if (!this.getAssessmentFrameworkById) throw new Error("Topic framework validation is required.");
    const framework = await this.getAssessmentFrameworkById(frameworkId);
    assertAccess();
    if (!framework) throw new Error("The topic assessment framework could not be found.");
    if ((framework.frameworkType || "normal") !== practiceType) throw new Error("Practice type does not match the topic assessment framework.");
    const assignment = new SyllabusTopicPreAssessmentPractice({
      language: selectedLanguage, practiceId: practiceId.trim(), practiceType,
    });
    const saved = await this.syllabusRepository.assignPreAssessmentPractice(syllabus.id, topic.id, assignment);
    assertAccess();
    return saved;
  }
}

export {AssignTopicPreAssessmentPractice};
