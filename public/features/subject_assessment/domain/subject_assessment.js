import {createSyllabusLanguageKey} from "../../syllabus/domain/syllabus.js?v=20261109-subject-assessment-generation-v1";
import {toQuestionLanguageDocumentId} from "../../question/domain/question.js?v=20261109-subject-assessment-generation-v1";
import {questionCollectionPath} from "../../essay_question_generator/domain/essay_question.js?v=20261112-essay-variation-v1";
import {passageCollection} from "../../fill_in_the_blanks_question_generator/domain/fill_in_the_blanks.js?v=20261109-subject-assessment-generation-v1";

function problem(message, code = "invalid-argument") {return Object.assign(new Error(message), {code});}
function id(value, name = "ID") {
  if (typeof value !== "string" || !value.trim() || value.includes("/") || [".", ".."].includes(value.trim())
      || /^__.*__$/.test(value.trim()) || new TextEncoder().encode(value.trim()).length > 1500) throw problem(`${name} is invalid.`);
  return value.trim();
}
function scope(input) {
  if (typeof input?.language !== "string" || !input.language.trim()) throw problem("Select a language.");
  return {studentId: id(input.studentId, "Student ID"), syllabusId: id(input.syllabusId, "Syllabus ID"), language: input.language.trim()};
}
function sameScope(a, b) {return a.studentId === b.studentId && a.syllabusId === b.syllabusId && createSyllabusLanguageKey(a.language) === createSyllabusLanguageKey(b.language);}
function clean(value) {
  if (value instanceof Date) return value;
  if (value?.toDate) return value.toDate();
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([key, item]) => [key, clean(item)]));
  return value;
}
function poolReference(type, content) {
  if (type === "normal") return `questions/${id(content.syllabusId)}/topics/${id(content.topicId)}/languages/${toQuestionLanguageDocumentId(content.language)}/diagramGroups/${content.hasDiagram ? "withDiagram" : "withoutDiagram"}/questionItems/${id(content.id ?? content.questionId)}`;
  if (type === "essay") return questionCollectionPath(content) + "/" + id(content.questionId);
  if (type === "fillInTheBlanks") return passageCollection(content) + "/" + id(content.passageId);
  throw problem("Unknown question format.");
}
function identity(type, content) {
  // Essay/passage indexes enforce globally unique IDs; MCQ IDs are scoped to a full path.
  return type + ":" + (type === "normal" ? poolReference(type, content) : id(type === "essay" ? content.questionId : content.passageId));
}
async function sourceKey(value) {
  const hash = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}
function slots(configuration) {
  const result = [];
  for (const topic of configuration.topics) for (const difficulty of ["easy", "medium", "hard"]) {
    for (let index = 0; index < topic.difficultyCounts[difficulty]; index++) result.push({position: result.length + 1, topicId: topic.topicId, questionType: topic.questionType, difficulty});
  }
  return result;
}
function slotId(position) {return String(position).padStart(8, "0");}
async function makeItem(slot, content, source, topicName) {
  if (!["reused", "generated"].includes(source)) throw problem("Unknown content source.");
  if (String(content.difficulty).toLowerCase() !== slot.difficulty) throw problem("The selected content has the wrong difficulty.");
  let contentSnapshot, marking;
  if (slot.questionType === "normal") {
    if (!content.questionText || !["a", "b", "c", "d"].every(key => typeof content.options?.[key] === "string" && content.options[key].trim())
        || !["a", "b", "c", "d"].includes(content.correctAnswer)) throw problem("The MCQ content is incomplete.");
    contentSnapshot = {questionText: content.questionText, options: {...content.options}, hasDiagram: content.hasDiagram,
      svg: content.svg || "", specialInstruction: content.specialInstruction || "", language: content.language};
    marking = {correctAnswer: content.correctAnswer, explanation: content.explanation || ""};
  } else if (slot.questionType === "essay") {
    if (!content.questionText) throw problem("The essay content is incomplete.");
    contentSnapshot = {questionText: content.questionText, wordCountRequirement: content.wordCountRequirement,
      support: content.support, previewImage: content.previewImage, language: content.language,
      seedUsed: content.seedUsed, essayTypeId: content.essayTypeId, essayType: content.essayType, storyFrames: content.storyFrames};
    marking = {};
  } else if (slot.questionType === "fillInTheBlanks") {
    if (!content.passageText || !content.questions?.length || content.questions.some(question => typeof question.correctAnswer !== "string" || !question.correctAnswer.trim())) throw problem("The passage or its model answers are incomplete.");
    contentSnapshot = {passageText: content.passageText, language: content.language, image: content.image, previewImage: content.previewImage,
      questions: content.questions.map(({correctAnswer, ...question}) => question), questionCount: content.questions.length};
    marking = {answers: Object.fromEntries(content.questions.map(question => [question.questionId, question.correctAnswer]))};
  } else throw problem("Unknown question format.");
  const key = identity(slot.questionType, content);
  return clean({...slot, topicName, identity: key, sourceKey: await sourceKey(key), sourceReference: poolReference(slot.questionType, content), source, contentSnapshot, marking});
}
function publicItem({marking, essayTypeSelection, identity: contentIdentity, ...item}) {return clean(item);}
function summary(items) {
  return {itemCount: items.length, questionCount: items.reduce((count, item) => count + (item.questionType === "fillInTheBlanks" ? item.contentSnapshot.questionCount : 1), 0),
    passageCount: items.filter(item => item.questionType === "fillInTheBlanks").length,
    reusedCount: items.filter(item => item.source === "reused").length, generatedCount: items.filter(item => item.source === "generated").length};
}
function validateItems(configuration, items) {
  const plan = slots(configuration);
  if (plan.length !== items.length || new Set(items.map(item => item.sourceKey)).size !== items.length) throw problem("Assessment items are incomplete or repeated.", "failed-precondition");
  for (let index = 0; index < plan.length; index++) {
    if (["position", "topicId", "questionType", "difficulty"].some(key => plan[index][key] !== items[index][key])) throw problem("Assessment items do not match the saved configuration.", "failed-precondition");
  }
}
export {problem, id, scope, sameScope, clean, poolReference, identity, sourceKey, slots, slotId, makeItem, publicItem, summary, validateItems};
