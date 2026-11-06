import {getFirestoreDb} from "../../../utils/firebase/firebase_ops.js";
import {id, scope, passageCollection, problem, isChineseLanguage, normalisePassageAnswerLengths, publicPassage} from "../domain/fill_in_the_blanks.js?v=20261105-chinese-count-v1";
import {dates} from "../../../utils/fill_in_the_blanks/access.js?v=20261104-fill-preassessment-v3";
class FirestorePassageRepository {
  constructor({getDb = getFirestoreDb} = {}) {this.getDb = getDb;}
  config() {return this.getDb().doc("fillInTheBlanksQuestionGenerator/config");}
  draft(passageId) {return this.getDb().collection("fillInTheBlanksDrafts").doc(id(passageId, "passageId"));}
  index(passageId) {return this.getDb().collection("fillInTheBlanksQuestionGenerator/passageIndex/entries").doc(id(passageId, "passageId"));}
  async get(passageId, {includeAnswers = false} = {}) {
    const index = await this.index(passageId).get();
    if (!index.exists) return null;
    const data = index.data(), path = passageCollection(data) + "/" + id(passageId);
    const ref = this.getDb().doc(path), snapshot = await ref.get();
    if (!snapshot.exists) throw problem("The saved passage index is incomplete.", "failed-precondition");
    const questions = await ref.collection("questionItems").get();
    let answers = {};
    if (includeAnswers) {
      const key = await ref.collection("private").doc("answerKey").get();
      if (!key.exists) throw problem("The passage model answers are missing.", "failed-precondition");
      answers = key.data().answers;
    }
    const passage = {passageId, ...dates(snapshot.data()), questions: questions.docs.map(doc => ({questionId: doc.id, ...doc.data(),
      ...(includeAnswers ? {correctAnswer: answers[doc.id]} : {})})).sort((a, b) => a.position - b.position)};
    const counted = normalisePassageAnswerLengths(passage);
    return includeAnswers ? counted : publicPassage(counted);
  }
  async save(passage) {
    passage = normalisePassageAnswerLengths(passage);
    const ref = this.getDb().collection(passageCollection(passage)).doc(id(passage.passageId));
    const {questions, ...data} = passage;
    await this.getDb().runTransaction(async tx => {
      const existing = await tx.get(ref);
      if (existing.exists) {
        if (["passageText", "summary", "level", "grade", "difficulty", "questionCount"].some(key => existing.data()[key] !== data[key])) throw problem("The passage ID already belongs to different content.", "already-exists");
        const key = await tx.get(ref.collection("private").doc("answerKey"));
        const model = Object.fromEntries(questions.map(q => [q.questionId, q.correctAnswer]));
        if (!key.exists || Object.keys(model).length !== Object.keys(key.data().answers ?? {}).length
            || Object.entries(model).some(([questionId, answer]) => key.data().answers[questionId] !== answer)) throw problem("The saved model answers are immutable.", "already-exists");
        return;
      }
      tx.set(ref, {...data, format: "fillInTheBlanks", generatedAt: new Date()});
      for (const {questionId, correctAnswer, ...question} of questions) tx.set(ref.collection("questionItems").doc(questionId), question);
      tx.set(ref.collection("private").doc("answerKey"), {answers: Object.fromEntries(questions.map(q => [q.questionId, q.correctAnswer]))});
      tx.set(this.index(passage.passageId), scope(passage));
    });
    return this.get(passage.passageId);
  }
  async list(input) {
    let query = this.getDb().collection(passageCollection(input));
    if (input.difficulty) query = query.where("difficulty", "==", input.difficulty);
    // Stream pages, rather than loading an arbitrarily truncated reuse pool.
    const passages = []; let last = null;
    do {
      let page = query.orderBy("__name__").limit(200);
      if (last) page = page.startAfter(last);
      const snapshot = await page.get();
      passages.push(...snapshot.docs.map(doc => ({passageId: doc.id, ...dates(doc.data())})));
      last = snapshot.size === 200 ? snapshot.docs.at(-1) : null;
    } while (last);
    return passages;
  }
  async summaries(criteria, history) {
    let query = this.getDb().collectionGroup("passages").where("format", "==", "fillInTheBlanks")
      .where("level", "==", criteria.level).where("grade", "==", criteria.grade).where("difficulty", "==", criteria.difficulty)
      .orderBy("generatedAt", "desc");
    if (history.mode === "recent") query = query.limit(history.count);
    const summaries = []; let last = null;
    do {
      let page = query.limit(history.mode === "recent" ? Math.min(200, history.count - summaries.length) : 200);
      if (last) page = page.startAfter(last);
      const snapshot = await page.get();
      summaries.push(...snapshot.docs.map(doc => doc.data().summary));
      last = snapshot.size === 200 && (history.mode === "all" || summaries.length < history.count) ? snapshot.docs.at(-1) : null;
    } while (last);
    return summaries;
  }
}
export {FirestorePassageRepository};
