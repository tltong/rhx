const missionPracticeTypes = Object.freeze({NORMAL: "normal", ESSAY: "essay", FILL_IN_THE_BLANKS: "fillInTheBlanks"});
function missionPracticeType(value = "normal") {
 if (!Object.values(missionPracticeTypes).includes(value)) throw new Error("Unknown mission practice type.");
 return value;
}
// Omitted type remains the legacy normal-practice contract.
function missionTypeFields(value) {return missionPracticeType(value) !== "normal" ? {practiceType: missionPracticeType(value)} : {};}
function studentPracticeRoot(type) {return missionPracticeType(type) === "fillInTheBlanks" ? "studentFillInTheBlanksPractices" : type === "essay" ? "studentEssayPractices" : "studentPractices";}
function studentPracticeKind(type, completed = false) {return type === "essay" ? (completed ? "completedEssayPractices" : "assignedEssayPractices") : (completed ? "completedPractices" : "assignedPractices");}
module.exports = {missionPracticeTypes, missionPracticeType, missionTypeFields, studentPracticeRoot, studentPracticeKind};
