import assert from "node:assert/strict";
import {test} from "node:test";
import {readFile} from "node:fs/promises";
import {mountQuestionReview} from "./question_review.js";

const html = await readFile(new URL("./question_review.html", import.meta.url), "utf8");
class Element {
  constructor(tag = "div") {
    this.tagName = tag;
    this.nodeType = 1;
    this.children = [];
    this.attributes = new Map();
    this.listeners = new Map();
    this.classes = new Set();
    this.classList = {toggle: (name, enabled) => enabled ? this.classes.add(name) : this.classes.delete(name)};
    this.hidden = false;
    this.disabled = false;
    this.value = "";
    this.textContent = "";
  }
  append(...children) {this.children.push(...children);}
  replaceChildren(...children) {this.children = children;}
  setAttribute(name, value) {this.attributes.set(name, value);}
  addEventListener(name, listener) {this.listeners.set(name, listener);}
  removeEventListener(name, listener) {if (this.listeners.get(name) === listener) this.listeners.delete(name);}
  focus() {this.focused = true;}
  async click() {if (!this.disabled) return this.listeners.get("click")?.();}
  async submit() {return this.listeners.get("submit")?.({preventDefault() {}});}
}
const question = {
  id: "q", language: "English", questionText: "Two triangle angles are 60° and 70°. Find the third.",
  options: {a: "30°", b: "40°", c: "50°", d: "60°"}, correctAnswer: "c",
  explanation: "180° − 60° − 70° = 50°.",
  hasDiagram: true, svg: '<svg xmlns="http://www.w3.org/2000/svg"><text>A = 60°</text></svg>',
};
const config = {
  correctAnswerMessage: {English: "Well done!", "中文": "答对了"},
  incorrectAnswerMessage: {English: "Try again.", "中文": "再试一次"},
};
function miniSet(language = "English") {
  return {questionId: "q", language, miniQuestions: [
    {sequence: 1, questionText: "What do a triangle's angles add up to?", expectedAnswer: "180°",
      acceptedAnswers: ["180"], answerExplanation: "All three interior angles add to 180°."},
    {sequence: 2, questionText: "What is the missing angle?", expectedAnswer: "50°",
      acceptedAnswers: ["50"], answerExplanation: "Subtract the two known angles from 180°."},
  ]};
}
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {resolve = res; reject = rej;});
  return {promise, resolve, reject};
}
function harness(options = {}) {
  const elements = new Map([...html.matchAll(/<[^>]*\bid="([^"]+)"[^>]*>/g)].map(match => {
    const element = new Element(match[0].match(/^<(\w+)/)[1]);
    element.hidden = /\bhidden\b/.test(match[0]);
    element.disabled = /\bdisabled\b/.test(match[0]);
    return [match[1], element];
  }));
  const root = {getElementById: id => elements.get(id), createElement: tag => new Element(tag)};
  const get = id => elements.get(id);
  let authListener;
  let unsubscribed = false;
  const loads = [];
  const checks = [];
  const revoked = [];
  const navigations = [];
  const errors = [];
  const page = mountQuestionReview({
    root, params: new URLSearchParams(options.query ?? "questionId=q"),
    loadQuestion: async id => {loads.push(["question", id]); return options.loadQuestion ? options.loadQuestion(id) : question;},
    loadConfig: async () => {loads.push(["config"]); return options.loadConfig ? options.loadConfig() : config;},
    loadSet: async input => {loads.push(["set", input]); return options.loadSet ? options.loadSet(input) : miniSet(input.language);},
    checkAnswer: async input => {
      checks.push(input);
      return options.checkAnswer ? options.checkAnswer(input) : {isCorrect: input.answer === (input.sequence === 1 ? "180" : "50")};
    },
    onAuthChanged: callback => {authListener = callback; return () => {unsubscribed = true;};},
    navigate: url => navigations.push(url),
    createDiagramUrl: svg => {assert.equal(svg, question.svg); return "blob:diagram";},
    revokeDiagramUrl: url => revoked.push(url),
    reportError: details => errors.push(details),
  });
  const authenticate = user => authListener(user);
  const ready = options.noAuth ? Promise.resolve() : authenticate({uid: "student-1"});
  return {page, ready, get, loads, checks, revoked, navigations, errors, authenticate, get unsubscribed() {return unsubscribed;}};
}

test("shows an indeterminate progress bar and the original question while mini questions are pending", async () => {
  const waiting = deferred();
  let called;
  const started = deferred();
  const h = harness({loadSet: input => {called = input; started.resolve(); return waiting.promise;}});
  await started.promise;
  assert.deepEqual(called, {questionId: "q", language: "English"});
  assert.equal(h.get("review-original").hidden, false);
  assert.equal(h.get("review-diagram").children[0].src, "blob:diagram");
  assert.equal(h.get("review-preparation").hidden, false);
  assert.equal(h.get("review-preparation-message").textContent, "Preparing your guided questions…");
  assert.equal(h.get("review-guidance").attributes.get("aria-busy"), "true");
  assert.equal(h.get("review-answer-form").hidden, true);
  assert.equal(h.get("check-review-answer").disabled, true);
  assert.equal(h.get("next-review-question").disabled, true);
  assert.equal(h.get("review-final-answer").textContent, "");
  waiting.resolve(miniSet());
  await h.ready;
  assert.equal(h.get("review-preparation").hidden, true);
  assert.equal(h.get("review-guidance").attributes.get("aria-busy"), "false");
  assert.equal(h.get("review-answer-form").hidden, false);
  assert.equal(h.get("review-step").textContent, "Step 1 of 2");
  assert.equal(h.get("review-mini-question").textContent, miniSet().miniQuestions[0].questionText);
  assert.equal(h.get("review-answer").disabled, false);
  assert.equal(h.get("review-answer").focused, true);
  assert.equal(h.get("review-step-explanation").hidden, true);
});

test("fast cached responses also clear the preparation indicator", async () => {
  const h = harness();
  await h.ready;
  assert.equal(h.get("review-preparation").hidden, true);
  assert.equal(h.get("review-answer-form").hidden, false);
  assert.equal(h.get("review-options").children.length, 4);
  assert.equal(h.get("review-complete").hidden, true);
  assert.equal(h.get("review-final-explanation").textContent, "");
});

test("result links are available while loading and preserve the practice using the signed-in student", async () => {
  const waiting = deferred();
  const practiceId = "practice #1 & review";
  const h = harness({
    query: new URLSearchParams({questionId: "q", practiceId, studentId: "another-student"}).toString(),
    loadSet: () => waiting.promise,
  });
  for (const id of ["review-back-to-results", "review-complete-back-to-results"]) {
    assert.equal(h.get(id).hidden, false);
    const href = new URL(h.get(id).href, "https://readyherox.web.app");
    assert.equal(href.pathname, "/features/practice_result/pages/result/practice_result.html");
    assert.equal(href.searchParams.get("practiceId"), practiceId);
    assert.equal(href.searchParams.get("studentId"), "student-1");
  }
  waiting.resolve(miniSet());
  await h.ready;
});

test("direct review links without a practice do not show a broken result link", async () => {
  const h = harness();
  await h.ready;
  assert.equal(h.get("review-back-to-results").hidden, true);
  assert.equal(h.get("review-complete-back-to-results").hidden, true);
});

test("result links follow account changes and are cleared on sign-out", async () => {
  const h = harness({query: "questionId=q&practiceId=practice-1"});
  await h.ready;
  await h.authenticate({uid: "student-2"});
  for (const id of ["review-back-to-results", "review-complete-back-to-results"]) {
    const href = new URL(h.get(id).href, "https://readyherox.web.app");
    assert.equal(href.searchParams.get("studentId"), "student-2");
  }
  await h.authenticate(null);
  for (const id of ["review-back-to-results", "review-complete-back-to-results"]) {
    assert.equal(h.get(id).hidden, true);
    assert.equal(h.get(id).href, "");
  }
});

test("Finish review returns directly to the originating result after correct or incorrect answers", async () => {
  const practiceId = "practice #1 & review";
  for (const answers of [["180", "50"], ["90", "40"]]) {
    const h = harness({query: new URLSearchParams({
      questionId: "q", practiceId, studentId: "another-student",
    }).toString()});
    await h.ready;
    for (const [index, answer] of answers.entries()) {
      h.get("review-answer").value = answer;
      await h.get("review-answer-form").submit();
      assert.deepEqual(h.navigations, []);
      assert.equal(h.get("next-review-question").textContent, index === 1 ? "Finish review" : "Next");
      await h.get("next-review-question").click();
      if (index === 0) assert.deepEqual(h.navigations, []);
    }
    assert.equal(h.navigations.length, 1);
    const destination = new URL(h.navigations[0], "https://readyherox.web.app");
    assert.equal(destination.pathname, "/features/practice_result/pages/result/practice_result.html");
    assert.equal(destination.searchParams.get("practiceId"), practiceId);
    assert.equal(destination.searchParams.get("studentId"), "student-1");
    assert.equal(h.get("review-complete").hidden, true);
    assert.equal(h.get("next-review-question").disabled, true);
    await h.get("next-review-question").click();
    assert.equal(h.navigations.length, 1);
  }
});

test("generation timeouts stop progress, expose retry and log the request ID without student data", async () => {
  const error = Object.assign(new Error("The AI service took too long to respond. Please try again."), {
    code: "deepseek-timeout", status: 504, requestId: "request-1",
  });
  const h = harness({loadSet: async () => {throw error;}});
  await h.ready;
  assert.equal(h.get("review-preparation").hidden, true);
  assert.equal(h.get("review-load-error").hidden, false);
  assert.equal(h.get("review-error-message").textContent, error.message);
  assert.equal(h.get("retry-review").disabled, false);
  assert.equal(h.get("review-original").hidden, false);
  assert.deepEqual(h.errors, [{action: "prepare-guided-questions", code: "deepseek-timeout",
    status: 504, requestId: "request-1", message: error.message}]);
});

test("generation failures hide progress, retain the original question and offer retry without duplicate loads", async () => {
  const waiting = deferred();
  const started = deferred();
  let calls = 0;
  const h = harness({loadSet: () => {
    calls++;
    if (calls === 1) throw new Error("Generation unavailable");
    started.resolve();
    return waiting.promise;
  }});
  await h.ready;
  assert.equal(h.get("review-preparation").hidden, true);
  assert.equal(h.get("review-load-error").hidden, false);
  assert.equal(h.get("review-error-message").textContent, "Generation unavailable");
  assert.equal(h.get("review-original").hidden, false);
  const retry = h.get("retry-review").click();
  await started.promise;
  await h.get("retry-review").click();
  assert.equal(calls, 2);
  assert.equal(h.get("review-preparation").hidden, false);
  assert.equal(h.get("review-load-error").hidden, true);
  waiting.resolve(miniSet());
  await retry;
  assert.equal(h.get("review-answer-form").hidden, false);
  assert.equal(h.loads.filter(([kind]) => kind === "question").length, 1);
});

test("missing ID and missing question do not request mini questions", async () => {
  const missingId = harness({query: ""});
  await missingId.ready;
  assert.equal(missingId.get("review-preparation").hidden, true);
  assert.equal(missingId.get("retry-review").hidden, true);
  assert.deepEqual(missingId.loads, []);
  const missingQuestion = harness({loadQuestion: async () => null});
  await missingQuestion.ready;
  assert.match(missingQuestion.get("review-error-message").textContent, /could not be found/);
  assert.equal(missingQuestion.get("review-original").hidden, true);
  assert.deepEqual(missingQuestion.loads.map(([kind]) => kind), ["question"]);
});

test("unconfigured feedback prevents generation and retries fetch newly saved configuration", async () => {
  let available = false;
  const h = harness({loadConfig: async () => available ? config : null});
  await h.ready;
  assert.match(h.get("review-error-message").textContent, /not been configured/);
  assert.equal(h.loads.some(([kind]) => kind === "set"), false);
  available = true;
  await h.get("retry-review").click();
  assert.equal(h.get("review-answer-form").hidden, false);
});

test("accepts an optional language and displays the configured translated messages", async () => {
  const h = harness({query: "questionId=q&language=" + encodeURIComponent("中文"), checkAnswer: async () => ({isCorrect: true})});
  await h.ready;
  assert.deepEqual(h.loads.find(([kind]) => kind === "set")[1], {questionId: "q", language: "中文"});
  h.get("review-answer").value = "180";
  await h.get("review-answer-form").submit();
  assert.equal(h.get("review-feedback").textContent, "答对了");
});

test("blank answers and unearned Next clicks do not advance or invoke answer checking", async () => {
  const h = harness();
  await h.ready;
  h.get("review-answer").value = "  ";
  await h.get("review-answer-form").submit();
  assert.equal(h.checks.length, 0);
  assert.equal(h.get("next-review-question").disabled, true);
  assert.equal(h.get("review-answer").attributes.get("aria-invalid"), "true");
  assert.equal(h.get("review-step").textContent, "Step 1 of 2");
  assert.equal(h.get("review-step-answer").textContent, "");
  assert.equal(h.get("review-step-explanation").hidden, true);
});

test("incorrect answers reveal the answer and explanation and allow every step to finish", async () => {
  const h = harness();
  await h.ready;
  for (const [index, answer] of ["90", "40"].entries()) {
    await h.get("next-review-question").click();
    assert.equal(h.get("review-step").textContent, "Step " + (index + 1) + " of 2");
    assert.equal(h.get("review-step-explanation").hidden, true);
    assert.equal(h.get("review-step-answer").textContent, "");
    h.get("review-answer").value = answer;
    await h.get("review-answer-form").submit();
    assert.equal(h.get("review-feedback").textContent, "Try again.");
    assert.equal(h.get("review-feedback").classes.has("is-error"), true);
    assert.equal(h.get("review-answer").value, answer);
    assert.equal(h.get("review-answer").attributes.get("aria-invalid"), "true");
    assert.equal(h.get("review-answer").disabled, true);
    assert.equal(h.get("check-review-answer").disabled, true);
    assert.equal(h.get("next-review-question").disabled, false);
    assert.equal(h.get("next-review-question").focused, true);
    assert.equal(h.get("review-step-explanation").hidden, false);
    assert.equal(h.get("review-step-answer").textContent, miniSet().miniQuestions[index].expectedAnswer);
    assert.equal(h.get("review-step-explanation-text").textContent, miniSet().miniQuestions[index].answerExplanation);
    assert.equal(h.get("review-step").textContent, "Step " + (index + 1) + " of 2");
    assert.equal(h.get("review-complete").hidden, true);
    await h.get("review-answer-form").submit();
    assert.equal(h.checks.length, index + 1);
    await h.get("next-review-question").click();
  }
  assert.equal(h.get("review-complete").hidden, false);
  assert.equal(h.get("review-final-answer").textContent, question.options[question.correctAnswer]);
});

test("correct answers show each answer and explanation, then completion reveals the original answer", async () => {
  const h = harness();
  await h.ready;
  for (const [index, answer] of ["180", "50"].entries()) {
    h.get("review-answer").value = answer;
    await h.get("review-answer-form").submit();
    assert.deepEqual(h.checks[index], {questionId: "q", language: "English", sequence: index + 1, answer});
    assert.equal(h.get("review-feedback").textContent, "Well done!");
    assert.equal(h.get("review-step-answer").textContent, miniSet().miniQuestions[index].expectedAnswer);
    assert.equal(h.get("review-step-explanation-text").textContent, miniSet().miniQuestions[index].answerExplanation);
    assert.equal(h.get("review-step-explanation").hidden, false);
    assert.equal(h.get("next-review-question").disabled, false);
    assert.equal(h.get("review-answer").disabled, true);
    await h.get("next-review-question").click();
  }
  assert.equal(h.get("review-complete").hidden, false);
  assert.equal(h.get("review-answer-form").hidden, true);
  assert.equal(h.get("review-final-answer").textContent, "50°");
  assert.equal(h.get("review-final-explanation").textContent, question.explanation);
  await h.get("restart-review").click();
  assert.equal(h.get("review-complete").hidden, true);
  assert.equal(h.get("review-step").textContent, "Step 1 of 2");
  assert.equal(h.get("review-step-explanation").hidden, true);
  assert.equal(h.get("review-step-answer").textContent, "");
  assert.equal(h.get("next-review-question").disabled, true);
  assert.equal(h.loads.filter(([kind]) => kind === "set").length, 1);
});

test("pending semantic checks disable controls and suppress repeated submissions", async () => {
  for (const isCorrect of [true, false]) {
    const waiting = deferred();
    const h = harness({checkAnswer: () => waiting.promise});
    await h.ready;
    h.get("review-answer").value = "one hundred and eighty";
    const pending = h.get("review-answer-form").submit();
    await h.get("review-answer-form").submit();
    await h.get("next-review-question").click();
    assert.equal(h.checks.length, 1);
    assert.equal(h.get("check-review-answer").textContent, "Checking…");
    assert.equal(h.get("review-answer").disabled, true);
    assert.equal(h.get("next-review-question").disabled, true);
    assert.equal(h.get("review-step-explanation").hidden, true);
    assert.equal(h.get("review-step-answer").textContent, "");
    assert.equal(h.get("review-step").textContent, "Step 1 of 2");
    waiting.resolve({isCorrect});
    await pending;
    assert.equal(h.get("next-review-question").disabled, false);
    assert.equal(h.get("review-step-answer").textContent, miniSet().miniQuestions[0].expectedAnswer);
  }
});

test("checking errors and malformed verdicts preserve the answer and allow another check", async () => {
  let calls = 0;
  const h = harness({checkAnswer: async () => {
    if (++calls === 1) throw new Error("Answer checking unavailable");
    return {isCorrect: calls === 2 ? "true" : false};
  }});
  await h.ready;
  h.get("review-answer").value = "180";
  await h.get("review-answer-form").submit();
  assert.equal(h.get("review-feedback").textContent, "Answer checking unavailable");
  assert.equal(h.get("review-answer").value, "180");
  assert.equal(h.get("review-answer").disabled, false);
  await h.get("review-answer-form").submit();
  assert.equal(h.get("next-review-question").disabled, true);
  assert.match(h.get("review-feedback").textContent, /Could not check/);
  assert.equal(h.get("review-step-explanation").hidden, true);
  assert.equal(h.get("review-step-answer").textContent, "");
  await h.get("review-answer-form").submit();
  assert.equal(h.get("next-review-question").disabled, false);
  assert.equal(h.get("review-step-explanation").hidden, false);
});

test("sign-out or disposal ignores late generation results and revokes diagram URLs", async () => {
  for (const dispose of [false, true]) {
    const waiting = deferred();
    const started = deferred();
    const h = harness({loadSet: () => {started.resolve(); return waiting.promise;}});
    await started.promise;
    if (dispose) h.page.dispose();
    else await h.authenticate(null);
    waiting.resolve(miniSet());
    await h.ready;
    assert.equal(h.get("review-answer-form").hidden, true);
    assert.deepEqual(h.revoked, ["blob:diagram"]);
    if (dispose) assert.equal(h.unsubscribed, true);
    else assert.deepEqual(h.navigations, ["/features/student/pages/sign_in/sign_in.html"]);
  }
});

test("page markup supplies accessible indeterminate progress and reduced-motion styling", async () => {
  const css = await readFile(new URL("./question_review.css", import.meta.url), "utf8");
  assert.match(html, /role="progressbar" aria-labelledby="review-preparation-message"/);
  assert.doesNotMatch(html, /aria-valuenow/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /<textarea[^>]*id="review-answer"/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /\[hidden\]/);
});
