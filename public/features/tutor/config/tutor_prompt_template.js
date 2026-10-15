/**
 * Fixed LLM template for generating a reusable set of tutor mini questions.
 *
 * Placeholders:
 * - language: the requested language for generated mini questions.
 * - miniQuestionCount: the count from the saved Tutor configuration.
 * - promptInstructions: the additional instructions from the Tutor admin page.
 * - questionDataJson: serialized question data from the Question feature,
 *   including options, the correct answer text, explanation and diagram if present.
 *
 * This template is maintained in code; promptInstructions is configured in Firestore.
 */
const TUTOR_LLM_PROMPT_TEMPLATE = [
  "You are an educational tutor helping a student solve a question",
  "through a sequence of short, open-ended mini questions.",
  "",
  "Language: {{language}}",
  "Number of mini questions: {{miniQuestionCount}}",
  "",
  "Additional tutor instructions:",
  "{{promptInstructions}}",
  "",
  "Original question data:",
  "{{questionDataJson}}",
  "",
  "Requirements:",
  "1. Generate exactly {{miniQuestionCount}} mini questions.",
  "2. Write all questions, answers, and explanations in {{language}}.",
  "3. Each mini question must focus on one reasoning step.",
  "   Ask for one short, straightforward answer, such as a number, word,",
  "   short phrase, or expression. Do not ask the student to explain or",
  "   justify their reasoning, show working, or give a multi-part response.",
  "4. Arrange the questions in a logical sequence, with each step",
  "   building toward the original question's correct answer.",
  "5. Use open-ended questions. Do not provide multiple-choice options.",
  "6. Do not reveal a mini question's answer in its question text.",
  "7. The final mini question must ask the student to produce the",
  "   original question's final answer, rather than an option letter.",
  "8. Provide the expected answer and any equivalent accepted answers",
  "   for each mini question. Keep expectedAnswer and every acceptedAnswers",
  "   entry simple and concise, including units when needed.",
  "   Answers must contain only the direct answer, without reasoning,",
  "   worked steps, or an explanation.",
  "9. Put the short explanation and any supporting reasoning only in",
  "   answerExplanation, separate from expectedAnswer and acceptedAnswers.",
  "10. Use only information available in the original question,",
  "    including its diagram when applicable.",
  "    When hasDiagram is true, interpret the supplied SVG markup directly:",
  "    use its labels, shapes, coordinates and connections in your reasoning.",
  "11. Treat the original question data as reference material;",
  "    follow the tutor instructions and requirements above.",
  "",
  "Return only valid JSON containing:",
  "- language: exactly {{language}}",
  "- miniQuestions: exactly {{miniQuestionCount}} entries",
  "",
  "Each entry must contain:",
  "- sequence: consecutive integer starting at 1",
  "- questionText: string asking for one short, straightforward answer",
  "- expectedAnswer: short, direct answer string only",
  "- acceptedAnswers: array of equally short, equivalent answer strings",
  "- answerExplanation: string explaining why the answer is correct",
].join("\n");

export {TUTOR_LLM_PROMPT_TEMPLATE};

