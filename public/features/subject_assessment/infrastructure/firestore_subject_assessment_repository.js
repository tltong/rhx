import {getFirestoreDb} from "../../../utils/firebase/firebase_ops.js?v=20261109-subject-assessment-generation-v1";
import {id, clean, publicItem} from "../domain/subject_assessment.js?v=20261109-subject-assessment-generation-v1";

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
  async get(assessmentId) {
    const ref = this.getDb().collection("subjectAssessments").doc(id(assessmentId, "Assessment ID"));
    const saved = await ref.get();
    if (!saved.exists) return null;
    const items = (await scan(ref.collection("items"))).map(doc => publicItem(doc.data())).sort((a, b) => a.position - b.position);
    return clean({assessmentId: saved.id, ...saved.data(), items});
  }
  async list(studentId, {limit = 20, after = null} = {}) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error("Limit must be from 1 to 100.");
    let query = this.getDb().collection("subjectAssessments").where("studentId", "==", id(studentId, "Student ID")).orderBy("__name__");
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
export {scan, FirestoreSubjectAssessmentRepository};
