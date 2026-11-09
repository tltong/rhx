const {problem, clean, slotId} = require("./subject_assessment");
const {validateAnswers} = require("../../fill_in_the_blanks_question_generator/domain/fill_in_the_blanks");

function record(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw problem(`${label} must be an object.`);
  return value;
}
function text(value, maximum, label) {
  if (typeof value !== "string" || value.length > maximum) throw problem(`${label} must be text of at most ${maximum} characters.`);
  return value;
}
function normalizeAnswers(assessment, input = [], {final = false} = {}) {
  if (!Array.isArray(input) || input.length > assessment.items.length) throw problem("Provide answers for assessment items only.");
  const known = new Map(assessment.items.map(item => [item.position, item])), answers = new Map();
  for (const entry of input) {
    record(entry, "Answer");
    const item = known.get(entry.position);
    if (!item || answers.has(entry.position)) throw problem("An answer references an unknown or repeated assessment item.");
    const fields = item.questionType === "normal" ? ["position", "questionType", "selectedOption"] : item.questionType === "essay" ? ["position", "questionType", "answer"] : ["position", "questionType", "answers"];
    if (entry.questionType !== undefined && entry.questionType !== item.questionType) throw problem("The answer format does not match the assessment item.");
    if (Object.keys(entry).some(key => !fields.includes(key))) throw problem("An answer contains unsupported fields.");
    let answer;
    if (item.questionType === "normal") {
      const selectedOption = entry.selectedOption === "" || entry.selectedOption == null ? null : entry.selectedOption;
      if (selectedOption !== null && !["a", "b", "c", "d"].includes(selectedOption)) throw problem("Select a valid MCQ option.");
      answer = {selectedOption};
    } else if (item.questionType === "essay") answer = {answer: text(entry.answer ?? "", 100000, "Essay answer")};
    else {
      const values = record(entry.answers ?? {}, "Passage answers"), questions = item.contentSnapshot.questions;
      if (Object.keys(values).some(key => !questions.some(question => question.questionId === key))) throw problem("An answer references a blank outside this passage.");
      const valuesById = Object.fromEntries(questions.map(question => [question.questionId, text(values[question.questionId] ?? "", 1000, "Blank answer")]));
      answer = {answers: final ? validateAnswers(questions, valuesById, item.contentSnapshot.language || assessment.language) : valuesById};
    }
    answers.set(item.position, {position: item.position, questionType: item.questionType, ...answer});
  }
  const result = final ? assessment.items.map(item => answers.get(item.position) || {
    position: item.position, questionType: item.questionType,
    ...(item.questionType === "normal" ? {selectedOption: null} : item.questionType === "essay" ? {answer: ""}
      : {answers: Object.fromEntries(item.contentSnapshot.questions.map(question => [question.questionId, ""]))}),
  }) : [...answers.values()];
  if (Buffer.byteLength(JSON.stringify(result)) > 750000) throw problem("These answers are too large to save together.");
  return clean(result);
}
function mergeAnswers(saved, incoming) {
  const combined = new Map(saved.map(item => [item.position, item]));
  for (const item of incoming) combined.set(item.position, item);
  return [...combined.values()].sort((a, b) => a.position - b.position);
}
function revision(input) {
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) throw problem("Provide the current answer revision.");
  return input.expectedRevision;
}
function requireRevision(saved, expected) {
  if ((saved?.revision || 0) !== expected) throw problem("Your answers changed in another session. Reload before saving.", "aborted");
}
const SCORING_POLICY = Object.freeze({version: 2, aggregation: "topic", mcqMaxMarks: 1, essayMaxMarks: 1, blankMaxMarks: 1});
function resultSummary(items, policy = SCORING_POLICY) {
  if (!items.length) throw problem("The assessment has no marked items.", "failed-precondition");
  const aggregate = entries => {
    const earnedMarks = entries.reduce((sum, item) => sum + item.earnedMarks, 0), maxMarks = entries.reduce((sum, item) => sum + item.maxMarks, 0);
    return {earnedMarks, maxMarks, score: maxMarks ? earnedMarks / maxMarks * 100 : 0,
      itemCount: entries.length, questionCount: entries.reduce((sum, item) => sum + item.questionCount, 0)};
  };
  for (const item of items) if (!Number.isFinite(item.earnedMarks) || !Number.isFinite(item.maxMarks) || item.maxMarks <= 0 || item.earnedMarks < 0 || item.earnedMarks > item.maxMarks) throw problem("Invalid item marks.", "failed-precondition");
  const breakdown = field => [...new Set(items.map(item => item[field]))].map(key => ({[field]: key,
    ...(field === "topicId" ? {topicName: items.find(item => item.topicId === key).topicName} : {}), ...aggregate(items.filter(item => item[field] === key))}));
  const topicBreakdown = breakdown("topicId"), summary = aggregate(items);
  if (policy.aggregation === "topic") summary.score = topicBreakdown.reduce((sum, topic) => sum + topic.score, 0) / topicBreakdown.length;
  return clean({...summary, scoringPolicy: policy, topicBreakdown, formatBreakdown: breakdown("questionType"), difficultyBreakdown: breakdown("difficulty")});
}
module.exports = {record, normalizeAnswers, mergeAnswers, revision, requireRevision, SCORING_POLICY, resultSummary, slotId};
