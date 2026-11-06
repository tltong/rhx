import {getFirestoreDb} from "../../utils/firebase/firebase_ops.js";
import {withAccess, dates} from "../../utils/fill_in_the_blanks/access.js?v=20261104-fill-preassessment-v3";
import {id} from "../fill_in_the_blanks_question_generator/domain/fill_in_the_blanks.js?v=20261104-fill-firestore-v2";
import {retryFillInTheBlanksCompletion} from "../student_fill_in_the_blanks_practice/student_fill_in_the_blanks_practice_module.js?v=20261104-fill-preassessment-v3";
export const getFillInTheBlanksGenerationStatus = input => withAccess(async () => {
  const snapshot = await getFirestoreDb().collection("studentFillInTheBlanksPracticeGenerations").doc(id(input.studentId))
    .collection("completions").doc(id(input.completedPracticeId)).get();
  if (!snapshot.exists) return null;
  const {leaseToken, ...data} = dates(snapshot.data()); return data;
});
export async function generateNextStudentFillInTheBlanksPractice(input) {
  await retryFillInTheBlanksCompletion({studentId: input.studentId, practiceId: input.completedPracticeId});
  return getFillInTheBlanksGenerationStatus(input);
}
