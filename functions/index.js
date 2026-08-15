const { generateDeepseekText } = require("./deepseek");
const {
  onSyllabusSubscriptionCreated,
} = require("./triggers/syllabus_subscription_trigger");
const {
  onStudentPracticeCompleted,
} = require("./triggers/student_practice_completion_trigger");

exports.generateDeepseekText = generateDeepseekText;
exports.onSyllabusSubscriptionCreated = onSyllabusSubscriptionCreated;
exports.onStudentPracticeCompleted = onStudentPracticeCompleted;
