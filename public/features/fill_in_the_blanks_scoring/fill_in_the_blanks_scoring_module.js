import {getFirestoreDb} from "../../utils/firebase/firebase_ops.js";
import {withAccess, dates} from "../../utils/fill_in_the_blanks/access.js?v=20261104-fill-preassessment-v3";
import {id, problem} from "../fill_in_the_blanks_question_generator/domain/fill_in_the_blanks.js?v=20261104-fill-firestore-v2";
export const getFillInTheBlanksScoringConfig = () => withAccess(async () => (await getFirestoreDb().doc("fillInTheBlanksScoring/config").get()).data() ?? {markingInstructions: ""});
export const saveFillInTheBlanksScoringConfig = input => withAccess(async context => {
  if (typeof input.markingInstructions !== "string" || input.markingInstructions.length > 20000) throw problem("Provide marking instructions of at most 20000 characters.");
  const data = {markingInstructions: input.markingInstructions, updatedBy: context.updatedBy, updatedAt: new Date()};
  context.assertAccess(); await getFirestoreDb().doc("fillInTheBlanksScoring/config").set(data); return data;
}, {admin: true});
export const getFillInTheBlanksResult = input => withAccess(async () => {
  const snapshot = await getFirestoreDb().collection("fillInTheBlanksPracticeResults").doc(id(input.practiceId)).collection("studentSubmissions").doc(id(input.studentId)).get();
  return snapshot.exists ? {studentId: input.studentId, practiceId: input.practiceId, ...dates(snapshot.data())} : null;
});
