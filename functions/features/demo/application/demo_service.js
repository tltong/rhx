const d = require("../domain/demo");

function createDemoService({repository, content, news, now = () => new Date()}) {
  async function configured(token) {
    const owner = await repository.read(token);
    if (!owner.session.scope) throw d.fail("Choose your country, level and grade first.", "failed-precondition");
    return owner;
  }
  async function state(token, input) {
    d.fields(input, ["attemptId", "retry"]);
    const {sessionId, attempt} = await repository.readAttempt(token, d.id(input.attemptId));
    const stale = attempt.status === "running" && d.millis(attempt.leaseUntil) <= now().getTime();
    const waiting = attempt.status === "waiting" && d.millis(attempt.retryAt) <= now().getTime();
    if (stale || waiting || attempt.status === "failed" && input.retry === true) {
      await repository.transaction(sessionId, async ({tx, ref: root, session}) => {
        const ref = repository.attemptRef(sessionId, attempt.attemptId), current = (await tx.get(ref)).data();
        if (!current || current.status !== attempt.status || current.requestSequence !== attempt.requestSequence) return;
        if (!current.submittedAt && session.activeAttemptId && session.activeAttemptId !== attempt.attemptId) {
          const pending = (await tx.get(repository.attemptRef(sessionId, session.activeAttemptId))).data();
          if (pending && ["queued", "running", "waiting"].includes(pending.status) && !pending.submittedAt) {
            throw d.fail("Wait for the current practice to finish preparing.", "resource-exhausted");
          }
        }
        tx.update(ref, {status: "queued", requestSequence: current.requestSequence + 1,
          leaseToken: null, leaseUntil: null, errorMessage: null});
        if (!current.submittedAt) tx.update(root, {activeAttemptId: attempt.attemptId});
      });
      return state(token, {attemptId: attempt.attemptId});
    }
    const view = d.publicAttempt(attempt);
    if (view.result?.review && content.reviewPolicy) {
      const enabled = await content.reviewPolicy(attempt);
      view.result = {...view.result, review: view.result.review.map(item => ({...item, tutorEnabled: enabled}))};
    }
    return {practice: view, summary: d.summary((await repository.read(token)).session)};
  }
  async function prepare(token, input) {
    d.fields(input, ["requestId", "syllabusId", "topicId", "language", "practiceType", "difficulty", "questionCount", "retry"]);
    const owner = await configured(token), requestId = d.id(input.requestId), attemptId = d.hash(requestId);
    const inputHash = d.hash(["syllabusId", "topicId", "language", "practiceType", "difficulty", "questionCount"].map(name => input[name] ?? null));
    const ref = repository.attemptRef(owner.sessionId, attemptId), existing = (await ref.get()).data();
    if (existing) {
      if (existing.status === "abandoned") throw d.fail("This practice has ended. Choose a practice again.", "failed-precondition");
      if (existing.inputHash !== inputHash) throw d.fail("This practice request was already used with different choices.", "already-exists");
      return state(token, {attemptId, retry: input.retry === true});
    }
    const [context, coinReward] = await Promise.all([content.context(owner.session.scope, input), content.coinReward()]);
    if (!Number.isSafeInteger(coinReward) || coinReward < 0) throw d.fail("Practice rewards are not configured correctly.", "failed-precondition");
    await repository.transaction(owner.sessionId, async ({tx, ref: root, session}) => {
      const current = (await tx.get(ref)).data();
      if (current) {
        if (current.inputHash !== inputHash) throw d.fail("This practice request was already used.", "already-exists");
        return;
      }
      if (d.hash(session.scope) !== d.hash(owner.session.scope)) throw d.fail("Your demo setup changed. Choose the practice again.", "aborted");
      if (session.activeAttemptId) {
        const pending = (await tx.get(repository.attemptRef(owner.sessionId, session.activeAttemptId))).data();
        if (pending && ["queued", "running", "waiting"].includes(pending.status) && !pending.submittedAt) {
          throw d.fail("Wait for your current practice to finish preparing, or return to subjects.", "resource-exhausted");
        }
      }
      tx.create(ref, {...context, attemptId, inputHash, coinReward, status: "queued", operation: "prepare",
        stage: "questions", requestSequence: 1, createdAt: now(), expiresAt: session.expiresAt});
      tx.update(root, {activeAttemptId: attemptId});
    });
    return state(token, {attemptId});
  }
  async function getFillInTheBlanksAnswers(token, input) {
    d.fields(input, ["attemptId"]);
    const {attempt} = await repository.readAttempt(token, d.id(input.attemptId));
    if (attempt.practiceType !== "fillInTheBlanks" || attempt.status !== "ready" || attempt.submittedAt) {
      throw d.fail("Open an unfinished fill-in-the-blanks practice to fill its answers.", "failed-precondition");
    }
    return {attemptId: attempt.attemptId, answers: Object.fromEntries(attempt.passage.questions.map(question => [question.questionId, question.correctAnswer]))};
  }
  async function submit(token, input) {
    d.fields(input, ["attemptId", "answers", "essayText"]);
    const {sessionId, attempt} = await repository.readAttempt(token, d.id(input.attemptId));
    if (attempt.submittedAt) return state(token, {attemptId: attempt.attemptId});
    if (attempt.status !== "ready") throw d.fail("Wait until the practice is ready before submitting.", "failed-precondition");
    const answers = d.submission(attempt, input);
    const result = attempt.practiceType === "normal" ? d.markMcq(attempt, answers) : null;
    await repository.transaction(sessionId, async ({tx, ref: root, session}) => {
      const ref = repository.attemptRef(sessionId, attempt.attemptId), current = (await tx.get(ref)).data();
      if (!current || current.status === "abandoned") throw d.fail("This practice has ended.", "failed-precondition");
      if (current.submittedAt) return;
      if (current.status !== "ready") throw d.fail("The practice is not ready.", "failed-precondition");
      const totals = d.addCoins(session, "practiceCoins", current.coinReward);
      totals.practicesCompleted++;
      tx.update(ref, {submission: answers, submittedAt: now(), result, status: result ? "completed" : "queued",
        operation: "mark", stage: result ? "completed" : "marking", requestSequence: current.requestSequence + 1});
      tx.update(root, {totals, ...(session.activeAttemptId === attempt.attemptId ? {activeAttemptId: null} : {})});
    });
    return state(token, {attemptId: attempt.attemptId});
  }
  async function cancel(token, input) {
    d.fields(input, ["attemptId", "requestId"]);
    if (!!input.attemptId === !!input.requestId) throw d.fail("Choose one practice to leave.");
    const attemptId = input.attemptId ? d.id(input.attemptId) : d.hash(d.id(input.requestId));
    const {sessionId} = await repository.read(token);
    await repository.transaction(sessionId, async ({tx, ref: root, session}) => {
      const ref = repository.attemptRef(sessionId, attemptId), attempt = (await tx.get(ref)).data();
      if (attempt && !attempt.submittedAt) tx.update(ref, {status: "abandoned", leaseToken: null, leaseUntil: null});
      // Fence a preparation whose first response has not reached the browser.
      if (!attempt) tx.create(ref, {attemptId, status: "abandoned", expiresAt: session.expiresAt, requestSequence: 0});
      if (session.activeAttemptId === attemptId) tx.update(root, {activeAttemptId: null});
    });
    return {cancelled: true};
  }
  function tutorIndex(input) {
    if (!Number.isInteger(input.questionIndex) || input.questionIndex < 0 || input.questionIndex >= d.MAX_MCQ_QUESTIONS) throw d.fail("Choose a practice question.");
    return input.questionIndex;
  }
  async function getTutor(token, input) {
    d.fields(input, ["attemptId", "questionIndex"]);
    const {sessionId, attempt} = await repository.readAttempt(token, input.attemptId), index = tutorIndex(input);
    const selected = await content.getTutor(attempt, index);
    const guide = {guideId: selected.guideId, miniQuestionCount: selected.miniQuestionCount,
      miniQuestions: selected.miniQuestions.map(({sequence, questionText}) => ({sequence, questionText}))};
    const saved = await repository.transaction(sessionId, async ({tx}) => {
      const ref = repository.attemptRef(sessionId, attempt.attemptId), current = (await tx.get(ref)).data();
      if (!current?.submittedAt || current.status !== "completed") throw d.fail("Complete this practice first.", "failed-precondition");
      const existing = current.tutorGuides?.[String(index)];
      if (existing) return existing;
      tx.update(ref, {tutorGuides: {...current.tutorGuides, [String(index)]: guide}});
      return guide;
    });
    return {questionIndex: index, ...saved};
  }
  async function getTutorAnswer(token, input) {
    d.fields(input, ["attemptId", "questionIndex", "sequence"]);
    const {attempt} = await repository.readAttempt(token, d.id(input.attemptId)), index = tutorIndex(input);
    const guide = attempt.tutorGuides?.[String(index)];
    if (!guide) throw d.fail("Open this question's tutor review first.", "failed-precondition");
    if (!Number.isInteger(input.sequence) || input.sequence < 1 || input.sequence > guide.miniQuestionCount) throw d.fail("Choose a tutor step.");
    const answer = await content.getTutorAnswer(attempt, index, input.sequence);
    await repository.read(token);
    return {questionIndex: index, sequence: input.sequence, answer};
  }
  async function checkTutor(token, input) {
    d.fields(input, ["attemptId", "questionIndex", "sequence", "answer"]);
    const {attempt} = await repository.readAttempt(token, input.attemptId), index = tutorIndex(input);
    if (!Number.isInteger(input.sequence) || input.sequence < 1 || input.sequence > (attempt.tutorGuides?.[String(index)]?.miniQuestionCount || 0)) throw d.fail("Choose a tutor step.");
    const result = await content.checkTutor(attempt, index, {sequence: input.sequence, answer: d.text(input.answer, "tutor answer", 10000)});
    await repository.read(token);
    return result;
  }
  async function runPractice(sessionId, attemptId, sequence) {
    const attempt = await repository.claim(sessionId, attemptId, sequence);
    if (!attempt) return null;
    try {
      const patch = attempt.operation === "mark" ? {status: "completed", stage: "completed", result: d.plain(await content.mark(attempt))}
        : await content.prepare(attempt, repository);
      return repository.checkpoint(sessionId, attempt, patch);
    } catch (error) {
      if (error.code === "demo-pool-busy") return repository.checkpoint(sessionId, attempt,
        {status: "waiting", stage: "questions", retryAt: new Date(now().getTime() + 5000)});
      require("firebase-functions/logger").warn("Demo practice operation failed", {operation: attempt.operation, code: error.code || "internal"});
      return repository.checkpoint(sessionId, attempt, {status: "failed",
        errorMessage: error.code === "failed-precondition" ? error.message
          : attempt.operation === "mark" ? "Your practice is complete and coins are earned. Retry to finish marking."
            : "The practice could not be prepared. Retry with the same choices."});
    }
  }
  return {
    async startDemo(token, input, context = {}) {d.fields(input, []); return {summary: await repository.start(token, context.sender)};},
    async getCatalog(token, input) {d.fields(input, []); await repository.read(token); return content.catalog();},
    async saveSetup(token, input) {
      d.fields(input, ["country", "level", "grade"]);
      const {sessionId} = await repository.read(token), scope = await content.validateScope(input);
      await repository.transaction(sessionId, async ({tx, ref, session}) => {
        if (session.activeAttemptId) throw d.fail("Return to subjects before changing setup.", "failed-precondition");
        tx.update(ref, {scope});
      });
      return {scope, ...(await content.subjects(scope))};
    },
    async getSubjects(token, input) {d.fields(input, []); const {session} = await configured(token); return content.subjects(session.scope);},
    preparePractice: prepare, getPractice: state, getFillInTheBlanksAnswers, submitPractice: submit, cancelPractice: cancel,
    getTutor, getTutorAnswer, checkTutor,
    async finishDemo(token, input) {d.fields(input, []); return {summary: await repository.finish(token)};},
    ...news,
    runPractice,
  };
}
module.exports = {createDemoService};
