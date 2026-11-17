const {createHash} = require("node:crypto");
const {requireEssayMinimumWordCount} = require("../../essay_practice_session/domain/essay_word_count");
const {validateAnswers} = require("../../fill_in_the_blanks_question_generator/domain/fill_in_the_blanks");

const SESSION_MS = 2 * 60 * 60 * 1000;
const MAX_MCQ_QUESTIONS = 100;
const LEASE_MS = 10 * 60 * 1000;
const fail = (message, code = "invalid-argument") => Object.assign(new Error(message), {code});
const key = value => String(value || "").normalize("NFKC").trim().toLowerCase();
const hash = value => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const millis = value => value?.toMillis?.() ?? new Date(value || 0).getTime();
function plain(value) {
  if (value?.toDate) return value.toDate();
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([name, item]) => [name, plain(item)]));
  return value;
}
function fields(value, allowed) {
  if (!value || typeof value !== "object" || Array.isArray(value)
      || Object.keys(value).some(name => !allowed.includes(name))) throw fail("Invalid demo request.");
  return value;
}
function text(value, label, max = 200) {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw fail("Provide a valid " + label + ".");
  return value.trim();
}
function id(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) throw fail("Invalid demo reference.");
  return value;
}
function sessionId(token) {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43,128}$/.test(token)) throw fail("Start a new demo to continue.", "unauthenticated");
  return hash(token);
}
function active(session, now) {
  if (!session || session.status !== "active" || millis(session.expiresAt) <= now.getTime()) {
    throw fail("This demo has ended. Start a new demo to continue.", "failed-precondition");
  }
  return session;
}
function summary(session) {
  return {...session.totals, expiresAt: session.expiresAt};
}
function addCoins(session, category, amount) {
  if (!Number.isSafeInteger(amount) || amount < 0) throw fail("The reward configuration is invalid.", "failed-precondition");
  const totals = {...session.totals, [category]: session.totals[category] + amount, totalCoins: session.totals.totalCoins + amount};
  if (!Number.isSafeInteger(totals.totalCoins)) throw fail("The demo coin balance is full.", "resource-exhausted");
  return totals;
}
function scopeMatches(syllabus, scope) {
  return syllabus?.active === true && key(syllabus.country) === key(scope.country)
    && key(syllabus.level) === key(scope.level) && Number(syllabus.year) === scope.grade;
}
function difficulty(value) {
  if (!["easy", "medium", "hard"].includes(value)) throw fail("Choose Easy, Medium or Hard.");
  return value;
}
function mcqChoices(input) {
  difficulty(input.difficulty);
  if (!Number.isSafeInteger(input.questionCount) || input.questionCount < 1 || input.questionCount > MAX_MCQ_QUESTIONS) {
    throw fail("Choose a whole number of questions from 1 to " + MAX_MCQ_QUESTIONS + ".");
  }
  return {difficulty: input.difficulty, questionCount: input.questionCount};
}
function submission(attempt, input) {
  if (attempt.practiceType === "normal") {
    if (!Array.isArray(input.answers) || input.answers.length !== attempt.questions.length) throw fail("Answer every question before submitting.");
    return attempt.questions.map((question, index) => {
      const item = input.answers[index];
      fields(item, ["questionId", "selectedOption"]);
      if (item.questionId !== question.id || !Object.hasOwn(question.options, item.selectedOption)) throw fail("Choose an answer for every question.");
      return {questionId: question.id, selectedOption: item.selectedOption};
    });
  }
  if (attempt.practiceType === "essay") {
    const answer = text(input.essayText, "essay", 100000);
    requireEssayMinimumWordCount(answer, attempt.question.wordCountRequirement?.minWords ?? null);
    return {essayText: answer};
  }
  return {answers: validateAnswers(attempt.passage.questions, input.answers, attempt.passage.language)};
}
function markMcq(attempt, answers) {
  const review = attempt.questions.map((question, index) => ({
    questionId: question.id, questionText: question.questionText, options: question.options,
    selectedOption: answers[index].selectedOption, correctAnswer: question.correctAnswer,
    isCorrect: answers[index].selectedOption === question.correctAnswer, explanation: question.explanation || "",
    svg: question.svg || null, tutorEnabled: attempt.tutorEnabled,
  }));
  const questionsCorrect = review.filter(item => item.isCorrect).length;
  return {questionsCorrect, totalQuestions: review.length, score: 100 * questionsCorrect / review.length, review};
}
function publicAttempt(attempt) {
  const result = {attemptId: attempt.attemptId, status: attempt.status, stage: attempt.stage,
    practiceType: attempt.practiceType, subject: attempt.subject, topic: attempt.topic,
    language: attempt.language, difficulty: attempt.difficulty, questionCount: attempt.questionCount,
    progress: attempt.progress || null, submitted: !!attempt.submittedAt,
    coinsEarned: attempt.submittedAt ? attempt.coinReward : 0, result: attempt.result || null,
    errorMessage: attempt.errorMessage || null};
  if (attempt.questions) result.questions = attempt.questions.map(question => ({
    id: question.id, questionText: question.questionText, options: question.options,
    svg: question.svg || null, hasDiagram: question.hasDiagram, difficulty: question.difficulty, language: question.language,
  }));
  if (attempt.question) {
    const q = attempt.question;
    result.question = {questionId: q.questionId, questionText: q.questionText,
      wordCountRequirement: q.wordCountRequirement || {minWords: null}, support: q.support || null, storyFrames: q.storyFrames || null};
  }
  if (attempt.passage) {
    const p = attempt.passage;
    result.passage = {passageId: p.passageId, passageText: p.passageText, image: p.image || null,
      language: p.language, difficulty: p.difficulty, questions: p.questions.map(q => ({
        questionId: q.questionId, position: q.position, requiredWordCount: q.requiredWordCount ?? null,
        ...(q.requiredCharacterCount == null ? {} : {requiredCharacterCount: q.requiredCharacterCount}),
      }))};
  }
  if (attempt.submittedAt) result.submission = attempt.submission;
  return result;
}
module.exports = {SESSION_MS, MAX_MCQ_QUESTIONS, LEASE_MS, fail, key, hash, millis, plain, fields, text, id, sessionId, active, summary, addCoins, scopeMatches, difficulty, mcqChoices, submission, markMcq, publicAttempt};
