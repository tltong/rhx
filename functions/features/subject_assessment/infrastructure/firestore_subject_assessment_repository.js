const {getFirestoreDb} = require("../../../utils/firebase/firebase_ops");
const {id, clean, publicItem} = require("../domain/subject_assessment");

async function scan(collection) {
  const docs = []; let after = null;
  do {
    let query = collection.orderBy("__name__").limit(200);
    if (after) query = query.startAfter(after);
    const page = await query.get(); docs.push(...page.docs);
    after = page.size === 200 ? page.docs.at(-1) : null;
  } while (after);
  return docs;
}

class FirestoreSubjectAssessmentRepository {
  constructor({getDb = getFirestoreDb} = {}) {this.getDb = getDb;}
  async header(assessmentId) {
    const saved = await this.getDb().collection("subjectAssessments").doc(id(assessmentId, "Assessment ID")).get();
    return saved.exists ? clean({assessmentId: saved.id, ...saved.data()}) : null;
  }
  async getForMarking(assessmentId) {
    const assessment = await this.get(assessmentId);
    if (!assessment) throw new Error("The assessment could not be found.");
    const keys = await this.getDb().collection("subjectAssessments").doc(id(assessmentId)).collection("private").get();
    const marking = new Map(keys.docs.map(doc => [doc.id, doc.data().marking]));
    const {slotId} = require("../domain/subject_assessment");
    return {...assessment, items: assessment.items.map(item => ({...item, marking: marking.get(slotId(item.position))}))};
  }
  async getTutorItem(assessmentId, position) {
    const db = this.getDb(), ref = db.collection("subjectAssessments").doc(id(assessmentId));
    const {slotId} = require("../domain/subject_assessment");
    return db.runTransaction(async tx => {
      const result = db.collection("subjectAssessmentResults").doc(ref.id), key = slotId(position);
      const [root, item, markedRoot, markedItem] = await Promise.all([tx.get(ref), tx.get(ref.collection("items").doc(key)), tx.get(result), tx.get(result.collection("items").doc(key))]);
      if (!root.exists || !item.exists) return null;
      return clean({assessment: {assessmentId: root.id, ...root.data()}, item: item.data(),
        result: markedRoot.exists ? markedRoot.data() : null, marked: markedRoot.exists && markedItem.exists ? markedItem.data() : null});
    });
  }
  async getResult(assessmentId) {
    const ref = this.getDb().collection("subjectAssessmentResults").doc(id(assessmentId)), root = await ref.get();
    if (!root.exists) return null;
    const items = (await scan(ref.collection("items"))).map(doc => clean(doc.data())).sort((a, b) => a.position - b.position);
    return clean({assessmentId: root.id, ...root.data(), items});
  }
  async listResults(studentId, {limit = 20, after = null, syllabusId} = {}) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error("Limit must be from 1 to 100.");
    let query = this.getDb().collection("subjectAssessmentResults").where("studentId", "==", id(studentId, "Student ID")).orderBy("__name__");
    if (syllabusId !== undefined && syllabusId !== null) query = query.where("syllabusId", "==", id(syllabusId, "Syllabus ID"));
    if (after) query = query.startAfter(id(after));
    const page = await query.limit(limit + 1).get();
    return {results: page.docs.slice(0, limit).map(doc => clean({assessmentId: doc.id, ...doc.data()})), nextCursor: page.size > limit ? page.docs[limit - 1].id : null};
  }
  async get(assessmentId) {
    const ref = this.getDb().collection("subjectAssessments").doc(id(assessmentId, "Assessment ID"));
    const saved = await ref.get();
    if (!saved.exists) return null;
    const items = (await scan(ref.collection("items"))).map(doc => publicItem(doc.data())).sort((a, b) => a.position - b.position);
    return clean({assessmentId: saved.id, ...saved.data(), items});
  }
  async list(studentId, {limit = 20, after = null, syllabusId} = {}) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error("Limit must be from 1 to 100.");
    let query = this.getDb().collection("subjectAssessments").where("studentId", "==", id(studentId, "Student ID")).orderBy("__name__");
    if (syllabusId !== undefined && syllabusId !== null) query = query.where("syllabusId", "==", id(syllabusId, "Syllabus ID"));
    if (after) query = query.startAfter(id(after));
    const page = await query.limit(limit + 1).get();
    return {assessments: page.docs.slice(0, limit).map(doc => clean({assessmentId: doc.id, ...doc.data()})),
      nextCursor: page.size > limit ? page.docs[limit - 1].id : null};
  }
  async usage(studentId) {
    return (await scan(this.getDb().collection("studentSubjectAssessmentUsage").doc(id(studentId)).collection("items")))
      .map(doc => clean({sourceKey: doc.id, ...doc.data()}));
  }
}
module.exports = {scan, FirestoreSubjectAssessmentRepository};
