import {getFirestoreDb} from "../../../utils/firebase/firebase_ops.js?v=20261109-subject-assessment-generation-v1";
import {scan} from "../../subject_assessment/infrastructure/firestore_subject_assessment_repository.js?v=20261109-subject-assessment-generation-v1";
import {id, identity, problem} from "../../subject_assessment/domain/subject_assessment.js?v=20261109-subject-assessment-generation-v1";

class FirestoreStudentContentHistory {
  constructor({getDb = getFirestoreDb} = {}) {this.getDb = getDb;}
  async load(input) {
    const db = this.getDb(), studentId = id(input.studentId, "Student ID");
    if (!(await db.collection("students").doc(studentId).get()).exists) throw problem("The student could not be found. Check the Student ID.", "not-found");
    const used = new Set();
    const histories = await Promise.all(["studentPractices", "studentEssayPractices", "studentFillInTheBlanksPractices"].map(async root => {
      const kinds = root === "studentEssayPractices" ? ["assignedEssayPractices", "completedEssayPractices"] : ["assignedPractices", "completedPractices"];
      return {root, docs: (await Promise.all(kinds.map(kind => scan(db.collection(root).doc(studentId).collection(kind))))).flat()};
    }));
    const mcqIds = new Set();
    for (const {root, docs} of histories) for (const doc of docs) {
      const data = doc.data();
      if (root === "studentPractices") mcqIds.add(doc.id);
      if (root === "studentEssayPractices") {
        for (const key of ["essayQuestionId", "sourceEssayQuestionId"]) if (data[key]) used.add("essay:" + id(data[key]));
      }
      if (root === "studentFillInTheBlanksPractices" && data.passageId) used.add("fillInTheBlanks:" + id(data.passageId));
    }
    // A missing practice cannot safely be interpreted as an unused question pool.
    for (const practiceId of mcqIds) {
      const snapshot = await db.collection("practices").doc(practiceId).get();
      if (!snapshot.exists) throw problem("A practice in the student's history is missing. Restore it before generating an assessment.", "failed-precondition");
      const practice = snapshot.data();
      if (practice.type === "assessment") for (const reference of practice.questions || []) used.add(identity("normal", reference));
    }
    for (const topic of input.configuration.topics.filter(topic => topic.questionType === "fillInTheBlanks")) {
      const docs = await scan(db.collection("userUsedFillInTheBlanksPassages").doc(studentId).collection("syllabuses").doc(input.syllabusId)
        .collection("topics").doc(topic.topicId).collection("passages"));
      for (const doc of docs) used.add("fillInTheBlanks:" + doc.id);
    }
    const subjectUsage = await scan(db.collection("studentSubjectAssessmentUsage").doc(studentId).collection("items"));
    for (const doc of subjectUsage) {
      if (typeof doc.data().identity !== "string") throw problem("The student's subject assessment usage history is incomplete.", "failed-precondition");
      used.add(doc.data().identity);
    }
    return used;
  }
}
export {FirestoreStudentContentHistory};
