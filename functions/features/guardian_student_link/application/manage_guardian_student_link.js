const {inputObject, id, problem} = require("../../student/domain/student_profile");
function createGuardianStudentLinkService({getDb, authorize, verifyStudentToken, now = () => new Date()}) {
  async function manage(input, context, operation) {
    inputObject(input, operation === "link" ? ["guardianId", "studentId", "relationship", "studentIdToken"] : operation === "update" ? ["guardianId", "studentId", "relationship", "state", "studentIdToken"] : ["guardianId", "studentId"]);
    const guardianId = id(input.guardianId, "guardianId"), studentId = id(input.studentId);
    const access = await authorize({studentId, lookup: true,
      credential: context.auth?.uid === studentId && (operation === "link" || input.state === "active")}, context);
    if (!access.administrator && access.uid !== guardianId && access.uid !== studentId) throw problem("You cannot manage this guardian link.", "permission-denied");
    if (input.relationship !== undefined && !["parent", "teacher", "guardian"].includes(input.relationship)) throw problem("Choose parent, teacher or guardian relationship.");
    if (input.state !== undefined && !["active", "inactive"].includes(input.state)) throw problem("Choose active or inactive state.");
    if (operation === "link" && !input.relationship) throw problem("relationship is required.");
    let proof = false;
    if (input.studentIdToken !== undefined) {
      if (typeof input.studentIdToken !== "string" || input.studentIdToken.length > 10000) throw problem("Provide the student's fresh login token.");
      let decoded;
      try {decoded = await verifyStudentToken(input.studentIdToken);}
      catch {throw problem("The student login proof is invalid or expired. Confirm the student's login again.", "permission-denied");}
      const age = +now() / 1000 - decoded.auth_time;
      if (decoded.uid !== studentId || decoded.firebase?.sign_in_provider !== "password" || !Number.isFinite(age) || age < -60 || age > 300) throw problem("Confirm the selected student's current username and PIN again.", "permission-denied");
      proof = true;
    }
    const db = getDb(), linkRef = db.doc("guardianStudentLinks/" + guardianId + "__" + studentId);
    return db.runTransaction(async tx => {
      const [link, guardian, student] = await Promise.all([tx.get(linkRef), tx.get(db.doc("guardians/" + guardianId)), tx.get(db.doc("students/" + studentId))]);
      if (!guardian.exists || !student.exists) throw problem("Guardian or student not found.", "not-found");
      if (operation !== "link" && !link.exists) throw problem("Guardian link not found.", "not-found");
      const nextState = operation === "link" ? "active" : input.state || link.data()?.state;
      if (operation !== "unlink" && nextState === "active" && link.data()?.state !== "active" && !access.administrator && access.uid !== studentId) {
        if (!proof) throw problem("Confirm the student's current username and PIN before linking or reactivating.", "failed-precondition");
      }
      if (operation === "unlink") {tx.delete(linkRef); return {guardianId, studentId, unlinked: true};}
      const data = {guardianId, studentId, relationship: input.relationship || link.data().relationship,
        state: nextState, linkedAt: link.data()?.linkedAt || now(), updatedAt: now()};
      tx.set(linkRef, data);
      return {id: linkRef.id, ...data};
    });
  }
  return {linkStudentToGuardian: (input, context) => manage(input, context, "link"),
    updateGuardianStudentLink: (input, context) => manage(input, context, "update"), unlinkStudentFromGuardian: (input, context) => manage(input, context, "unlink")};
}
module.exports = {createGuardianStudentLinkService};
