const {randomUUID} = require("node:crypto");
const {hash, key, text, fail} = require("./news_article");
const QUESTION_VERSION = 1, QUESTION_COUNT = 3, DISTRACTOR_COUNT = 2;
const setId = edition => hash([QUESTION_VERSION, edition.questionFamilyId || edition.baseKey]);
const languageId = language => hash(key(language));
const attemptId = edition => hash([edition.storyId, edition.gradeKey]);
const normalizeAnswer = value => value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();
function array(value, length, name) {
  if (!Array.isArray(value) || value.length !== length) throw fail("News questions need " + length + " " + name + ".", "invalid-news");
  return value;
}
function prompt(value) {
  const result = text(value, "question prompt", 800), blanks = result.match(/_{2,}/g);
  if (blanks?.length !== 1 || blanks[0] !== "____") throw fail("Each news question needs exactly one ____ blank.", "invalid-news");
  return result;
}
function answer(value) {return text(value, "question answer", 120);}
function accepted(values, correct) {
  if (values !== undefined && (!Array.isArray(values) || values.length > 8)) throw fail("Invalid accepted question answers.", "invalid-news");
  return [...new Map([correct, ...(values || [])].map(value => {const result = answer(value); return [normalizeAnswer(result), result];})).values()];
}
function evidence(raw, edition) {
  const page = edition.pages.find(page => page.position === raw?.pagePosition), quote = text(raw?.quote, "question evidence", 2500);
  if (!page) throw fail("Question evidence must reference an article page.", "invalid-news");
  if (raw.source === "text" && page.text.includes(quote)) return {pagePosition: page.position, source: "text", quote};
  if (raw.source === "image" && page.imageIndices.includes(raw.imageIndex)) {
    const offset = page.imageIndices.indexOf(raw.imageIndex), plan = edition.imagePlans[raw.imageIndex];
    if ([plan?.description, page.altTexts[offset]].some(value => value?.includes(quote))) return {pagePosition: page.position, source: "image", imageIndex: raw.imageIndex, quote};
  }
  throw fail("Question evidence was not found in the article's text or picture descriptions.", "invalid-news");
}
function uniqueChoices(choices, questions) {
  const terms = choices.map(choice => normalizeAnswer(choice.text));
  if (new Set(terms).size !== choices.length) throw fail("The shared word bank needs five different choices.", "invalid-news");
  for (const question of questions) if (question.acceptedAnswers.some(value => choices.some(choice => choice.id !== question.answerChoiceId && normalizeAnswer(choice.text) === normalizeAnswer(value)))) throw fail("A word-bank choice is ambiguous.", "invalid-news");
}
function normalizeQuestionSet(raw, edition) {
  const identity = setId(edition), questions = [], choices = [];
  for (const [index, item] of array(raw?.questions, QUESTION_COUNT, "questions").entries()) {
    const correct = answer(item.answer), choice = {id: "choice_" + randomUUID().replaceAll("-", ""), text: correct}; choices.push(choice);
    questions.push({id: "q" + (index + 1), prompt: prompt(item.prompt), answerChoiceId: choice.id, acceptedAnswers: accepted(item.acceptedAnswers, correct), evidence: evidence(item.evidence, edition)});
  }
  for (const value of array(raw.distractors, DISTRACTOR_COUNT, "distractors")) choices.push({id: "choice_" + randomUUID().replaceAll("-", ""), text: answer(value)});
  uniqueChoices(choices, questions);
  choices.sort((a, b) => hash([identity, a.id]).localeCompare(hash([identity, b.id])));
  return {setId: identity, version: QUESTION_VERSION, baseKey: edition.baseKey, questionFamilyId: edition.questionFamilyId || edition.baseKey, storyId: edition.storyId, gradeKey: edition.gradeKey,
    sourceEditionId: edition.editionId, language: edition.language, status: "ready", questions, choices};
}
function normalizeQuestionLanguage(raw, selected, edition) {
  const receivedQuestions = array(raw?.questions, QUESTION_COUNT, "translated questions"), receivedChoices = array(raw.choices, QUESTION_COUNT + DISTRACTOR_COUNT, "translated choices");
  if (new Set(receivedQuestions.map(item => item.id)).size !== QUESTION_COUNT || new Set(receivedChoices.map(item => item.id)).size !== 5) throw fail("Translated question identities must stay unchanged.", "invalid-news");
  const choices = selected.choices.map(choice => {
    const translated = receivedChoices.find(item => item.id === choice.id); if (!translated) throw fail("A translated choice is missing.", "invalid-news");
    return {id: choice.id, text: answer(translated.text)};
  });
  const questions = selected.questions.map(question => {
    const translated = receivedQuestions.find(item => item.id === question.id); if (!translated) throw fail("A translated question is missing.", "invalid-news");
    return {id: question.id, prompt: prompt(translated.prompt), answerChoiceId: question.answerChoiceId,
      acceptedAnswers: accepted(translated.acceptedAnswers, choices.find(choice => choice.id === question.answerChoiceId).text), evidence: evidence(translated.evidence, edition)};
  });
  uniqueChoices(choices, questions);
  return {setId: selected.setId, language: edition.language, sourceEditionId: edition.editionId, status: "ready", questions, choices};
}
function markAnswers(raw, selected, mode) {
  if (!Array.isArray(raw) || raw.length !== QUESTION_COUNT || new Set(raw.map(item => item?.questionId)).size !== QUESTION_COUNT) throw fail("Answer all three questions before submitting.");
  return selected.questions.map(question => {
    const item = raw.find(item => item?.questionId === question.id);
    if (!item || Object.keys(item).some(field => !["questionId", "value"].includes(field))) throw fail("Invalid question response.");
    const value = text(item.value, "question response", mode === "word_bank" ? 128 : 120);
    if (mode === "word_bank" && !selected.choices.some(choice => choice.id === value)) throw fail("Choose an answer from the word bank.");
    return {questionId: question.id, value, correct: mode === "word_bank" ? value === question.answerChoiceId : question.acceptedAnswers.some(accepted => normalizeAnswer(accepted) === normalizeAnswer(value))};
  });
}
function publicQuestions(selected, mode, attempt) {
  const submitted = attempt?.status === "submitted";
  return {status: "ready", setId: selected.setId, language: selected.language, answerMode: mode, questionCount: QUESTION_COUNT,
    questions: selected.questions.map(({id, prompt}) => ({id, prompt})), wordBank: mode === "word_bank" ? selected.choices : [],
    attempt: submitted ? {status: "submitted", score: attempt.score, total: QUESTION_COUNT, submittedAt: attempt.submittedAt?.toDate?.() || attempt.submittedAt, answerLanguage: attempt.language,
      review: selected.questions.map(question => {
        const response = attempt.responses.find(item => item.questionId === question.id);
        return {questionId: question.id, response: mode === "word_bank" ? selected.choices.find(choice => choice.id === response.value)?.text || "" : response.value,
          correct: response.correct, correctAnswer: selected.choices.find(choice => choice.id === question.answerChoiceId).text};
      })} : null};
}
module.exports = {QUESTION_VERSION, QUESTION_COUNT, DISTRACTOR_COUNT, setId, languageId, attemptId, normalizeAnswer, normalizeQuestionSet, normalizeQuestionLanguage, markAnswers, publicQuestions};
