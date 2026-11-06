const {randomUUID} = require("node:crypto");
const {getFirestoreDb} = require("../../utils/firebase/firebase_ops");
const {guardResetTransaction, guardStudentMaintenance} = require("../../utils/student_topic_reset_guard");
const {id, problem, validateAnswers} = require("../fill_in_the_blanks_question_generator/domain/fill_in_the_blanks");
const ROOT = "studentFillInTheBlanksPractices";
function createStudentFillInTheBlanksPracticeFeature({getDb = () => require("../../utils/firebase/firebase_ops").getFirestoreDb(),
  getPractice = input => require("../fill_in_the_blanks_practice/fill_in_the_blanks_practice_module").getFillInTheBlanksPracticeById(input), now = () => Date.now()} = {}) {
  const root = studentId => getDb().collection(ROOT).doc(id(studentId, "studentId"));
  const ref = (input, kind) => root(input.studentId).collection(kind).doc(id(input.practiceId, "practiceId"));
  const usage = (studentId, practice) => getDb().collection("userUsedFillInTheBlanksPassages").doc(id(studentId))
    .collection("syllabuses").doc(id(practice.syllabusId)).collection("topics").doc(id(practice.topicId)).collection("passages").doc(id(practice.passageId));
  const date = value => value?.toDate?.() ?? value;
  function read(snapshot, studentId) {
    if (!snapshot.exists) return null;
    const data = snapshot.data();
    return {studentId, practiceId: snapshot.id, ...data, ...Object.fromEntries(["assignedAt", "completedAt", "dateCompleted"].filter(key => data[key]).map(key => [key, date(data[key])]))};
  }
  async function maintenance(tx, studentId) {
    await guardResetTransaction(tx, getDb());
    await guardStudentMaintenance(tx, getDb().collection("studentPracticeResets").doc(studentId));
  }
  async function list(input, kind) {
    const studentId = id(input.studentId), limit = Math.max(1, Math.min(100, input.limit ?? 100));
    let query = root(studentId).collection(kind);
    for (const key of ["syllabusId", "topicId"]) if (input[key]) query = query.where(key, "==", id(input[key], key));
    query = query.orderBy("__name__");
    if (input.cursor) {
      let cursor;
      try {cursor = JSON.parse(Buffer.from(input.cursor, "base64url").toString());} catch {throw problem("Invalid practice history cursor.");}
      if (cursor.kind !== kind || cursor.studentId !== studentId || cursor.syllabusId !== (input.syllabusId ?? null)
          || cursor.topicId !== (input.topicId ?? null)) throw problem("Practice history cursor does not match its filters.");
      query = query.startAfter(id(cursor.after));
    }
    const snapshot = await query.limit(limit + 1).get(), docs = snapshot.docs.slice(0, limit);
    return {practices: docs.map(doc => read(doc, studentId)), nextCursor: snapshot.size > limit
      ? Buffer.from(JSON.stringify({kind, studentId, syllabusId: input.syllabusId ?? null, topicId: input.topicId ?? null, after: docs.at(-1).id})).toString("base64url") : null};
  }
  const api = {
    async getFillInTheBlanksCompletionProcessing(input) {
      const snapshot = await ref(input, "completionProcessing").get();
      if (!snapshot.exists) return null;
      const {leaseToken, leaseUntil, ...data} = snapshot.data(); return {...data, retryAt: leaseUntil?.toDate?.() ?? leaseUntil ?? null};
    },
    async getFillInTheBlanksSubmission(input) {
      const snapshot = await ref(input, "submissions").get();
      if (!snapshot.exists) return null;
      const {leaseToken, leaseUntil, ...data} = snapshot.data(); return {...data, retryAt: leaseUntil?.toDate?.() ?? leaseUntil ?? null};
    },
    getAssignedFillInTheBlanksPractice: async input => read(await ref(input, "assignedPractices").get(), input.studentId),
    getCompletedFillInTheBlanksPractice: async input => read(await ref(input, "completedPractices").get(), input.studentId),
    listAssignedFillInTheBlanksPractices: input => list(input, "assignedPractices"),
    listCompletedFillInTheBlanksPractices: input => list(input, "completedPractices"),
    async listUsedFillInTheBlanksPassageIds(input) {
      const collection = getDb().collection("userUsedFillInTheBlanksPassages").doc(id(input.studentId))
        .collection("syllabuses").doc(id(input.syllabusId)).collection("topics").doc(id(input.topicId)).collection("passages");
      return (await collection.get()).docs.map(doc => doc.id);
    },
    async assignFillInTheBlanksPracticeToStudent(input, options = {}) {
      const studentId = id(input.studentId), practice = await getPractice(id(input.practiceId));
      if (!practice) throw problem("The practice could not be found.", "not-found");
      const assigned = ref(input, "assignedPractices"), completed = ref(input, "completedPractices"), used = usage(studentId, practice);
      await getDb().runTransaction(async tx => {
        await maintenance(tx, studentId);
        const [a, c, u] = await Promise.all([tx.get(assigned), tx.get(completed), tx.get(used)]);
        if (a.exists || c.exists) {
          if ((c.exists ? c : a).data().passageId !== practice.passageId) throw problem("Conflicting student assignment.", "already-exists");
          return;
        }
        if (options.generation) {
          const generation = await tx.get(getDb().doc(options.generation.path));
          if (!generation.exists || generation.data().status !== "generating" || generation.data().leaseToken !== options.generation.leaseToken
              || generation.data().nextPracticeId !== input.practiceId) throw problem("This generation attempt has been replaced.", "generation-lease-lost");
        }
        if (options.sourceCompletion) {
          const source = await tx.get(root(studentId).collection("completedPractices").doc(id(options.sourceCompletion)));
          if (!source.exists || source.data().syllabusId !== practice.syllabusId || source.data().topicId !== practice.topicId) throw problem("The source completion was removed or reset.", "topic-practice-reset");
        }
        if (u.exists) throw problem("This passage has already been assigned to the student.", "passage-already-used");
        const assignedAt = new Date(now());
        const data = {type: practice.type ?? "assessment", syllabusId: practice.syllabusId, topicId: practice.topicId, language: practice.language,
          passageId: practice.passageId, difficulty: practice.difficulty, assignedAt};
        tx.create(assigned, data);
        tx.create(used, {practiceId: practice.id, assignedAt, completedAt: null});
      });
      return await api.getAssignedFillInTheBlanksPractice(input) ?? api.getCompletedFillInTheBlanksPractice(input);
    },
    async claimFillInTheBlanksSubmission(input, questions, language) {
      const answers = validateAnswers(questions, input.answers, language), token = randomUUID();
      if (!Number.isFinite(input.timeTakenSeconds) || input.timeTakenSeconds < 0) throw problem("timeTakenSeconds must be a nonnegative number.");
      return getDb().runTransaction(async tx => {
        await maintenance(tx, id(input.studentId));
        const [assignment, completion, submission] = await Promise.all([tx.get(ref(input, "assignedPractices")),
          tx.get(ref(input, "completedPractices")), tx.get(ref(input, "submissions"))]);
        if (completion.exists) return {completed: true};
        if (!assignment.exists) throw problem("The practice is not assigned to this student.", "not-found");
        const previous = submission.data(), until = date(previous?.leaseUntil);
        if (previous?.markingStatus === "marking" && until?.getTime() > now()) throw problem("Your submitted passage is still being marked. Please wait and check again.", "marking-in-progress");
        const data = {answers: previous?.answers ?? answers, submittedAt: previous?.submittedAt ?? new Date(now()),
          timeTakenSeconds: previous?.timeTakenSeconds ?? input.timeTakenSeconds, markingStatus: "marking", leaseToken: token,
          leaseUntil: new Date(now() + 5 * 60 * 1000), errorCode: null};
        tx.set(ref(input, "submissions"), {...data, ...(previous?.requestId ? {requestId: previous.requestId, requestedAt: previous.requestedAt} : {})});
        return {...data, completed: false};
      });
    },
    async failFillInTheBlanksSubmission(input, token, code) {
      await getDb().runTransaction(async tx => {
        await maintenance(tx, id(input.studentId));
        const snapshot = await tx.get(ref(input, "submissions"));
        if (snapshot.data()?.leaseToken === token && snapshot.data()?.markingStatus === "marking") tx.update(snapshot.ref,
          {markingStatus: "failed", leaseToken: null, leaseUntil: null, errorCode: String(code ?? "marking-failed")});
      });
    },
    async completeAssignedFillInTheBlanksPractice(input) {
      await getDb().runTransaction(async tx => {
        await maintenance(tx, id(input.studentId));
        const [assigned, completed, result] = await Promise.all([tx.get(ref(input, "assignedPractices")),
          tx.get(ref(input, "completedPractices")), tx.get(getDb().collection("fillInTheBlanksPracticeResults").doc(id(input.practiceId))
            .collection("studentSubmissions").doc(id(input.studentId)))]);
        if (completed.exists) return;
        if (!assigned.exists || !result.exists) throw problem("A complete marked result is required.", "failed-precondition");
        const data = result.data(), completedAt = new Date(now());
        if (!Number.isFinite(data.score) || data.score < 0 || data.score > 100) throw problem("Invalid final score.", "failed-precondition");
        tx.create(ref(input, "completedPractices"), {...assigned.data(), completedAt, dateCompleted: completedAt,
          score: data.score, questionsCorrect: data.questionsCorrect, totalQuestions: data.totalQuestions,
          studentAnswers: data.answers, timeTakenSeconds: data.timeTakenSeconds});
        tx.delete(assigned.ref);
        tx.update(ref(input, "submissions"), {markingStatus: "completed", leaseToken: null, leaseUntil: null});
        tx.update(usage(input.studentId, assigned.data()), {completedAt});
      });
      return api.getCompletedFillInTheBlanksPractice(input);
    },
  };
  return api;
}
module.exports = {...createStudentFillInTheBlanksPracticeFeature(), createStudentFillInTheBlanksPracticeFeature};
