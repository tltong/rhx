const {isChineseLanguage} = require("../domain/fill_in_the_blanks");
function buildPassagePrompt({criteria, topicName, settings, configuration, summaries}) {
  const chinese = isChineseLanguage(criteria.language);
  return "Generate one coherent, age-appropriate fill-in-the-blanks passage in the requested language. "
    + "The subject/topic is a generic assessed skill, not a required story setting. Freely choose a varied scenario. "
    + "Every blank must assess that skill and be answerable from written context alone. The whole passage has one difficulty. "
    + "Use exactly the required number of blanks, in order, marked {{q1}}, {{q2}}, etc. "
    + (chinese
      ? "For Chinese, each blank needs one model answer and its exact positive requiredCharacterCount. Count Unicode letters and numbers individually, including each Chinese character; ignore spaces, punctuation and symbols. '学校' has 2 characters and '图书馆' has 3; a supplementary Chinese character counts once. Use 1 to 30 characters per answer. "
      : "Each question needs a model answer and its exact positive word count. Answers can be words or short phrases. Count whitespace-separated words, not letters or syllables: 'the dog' and 'தமிழ் மொழி' each have 2 words. Hyphenated words and contractions without spaces count as one word. ")
    + "Return one model answer per blank, with no list of alternatives or explanation inside correctAnswer. "
    + "Use correct spelling and grammar. A multiword answer still represents one question. "
    + "Return a summary of only a few words describing the scenario. Avoid scenarios in the supplied previous summaries. "
    + "When images are enabled, derive an imagePrompt from the completed passage. Match its setting, characters and actions; "
    + "describe a supportive illustration with no captions, written answers or essential image-only clues. "
    + "Return only JSON: {\"passageText\":\"...{{q1}}...\",\"summary\":\"few words\",\"imagePrompt\":null,"
    + (chinese
      ? "\"questions\":[{\"questionId\":\"q1\",\"requiredCharacterCount\":2,\"correctAnswer\":\"学校\"}]}. "
      : "\"questions\":[{\"questionId\":\"q1\",\"requiredWordCount\":1,\"correctAnswer\":\"word\"}]}. ")
    + "Use an imagePrompt string instead of null when images are enabled. "
    + "Keep the JSON contract and blank count even when additional instructions differ.\n"
    + JSON.stringify({criteria, topicName, questionsPerPassage: settings.questionsPerPassage, imageEnabled: settings.imageEnabled,
      instructions: {common: configuration.additionalLlmInstructions, grade: settings.additionalLlmInstructions,
        difficulty: configuration.difficultyInstructions[criteria.difficulty]}, previousSummaries: summaries});
}
module.exports = {buildPassagePrompt};
