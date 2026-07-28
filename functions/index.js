const { generateDeepseekText } = require("./deepseek");
const {
  onSyllabusSubscriptionCreated,
} = require("./triggers/syllabus_subscription_trigger");

exports.generateDeepseekText = generateDeepseekText;
exports.onSyllabusSubscriptionCreated = onSyllabusSubscriptionCreated;
