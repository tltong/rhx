const missionPracticeTypes = Object.freeze({NORMAL: "normal", ESSAY: "essay"});
function missionPracticeType(value = "normal") {
 if (!Object.values(missionPracticeTypes).includes(value)) throw new Error("Unknown mission practice type.");
 return value;
}
// Omitted type remains the legacy normal-practice contract.
function missionTypeFields(value) {return missionPracticeType(value) === "essay" ? {practiceType: "essay"} : {};}
module.exports = {missionPracticeTypes, missionPracticeType, missionTypeFields};
