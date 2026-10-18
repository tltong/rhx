/**
 * loadEssayPracticeSession({studentId, essayPracticeId})
 *   -> {status: "assigned"|"completed", practice, question, result|null}
 * submitEssayPracticeSession({studentId, essayPracticeId, essayText, timeTakenSeconds})
 *   -> CompletedEssayPractice. Saves once; retries return the original submission.
 *   Enforces the saved question's minimum word count for new submissions.
 * After submission is saved, the completion trigger scores the essay, updates topic/subject
 * readiness and reliability, and generates/assigns the next essay asynchronously.
 * Feature APIs only; no Firebase callable endpoints.
 */
const studentEssays = require("../student_essay_practice/student_essay_practice_module");
const {getEssayQuestionById} = require("../essay_question_generator/essay_question_generator_module");
const {getEssayResult} = require("../essay_scoring/essay_scoring_module");
const {LoadEssayPracticeSession} = require("./application/load_essay_practice_session");
const {SubmitEssayPracticeSession} = require("./application/submit_essay_practice_session");

const load = new LoadEssayPracticeSession({...studentEssays, getEssayQuestionById, getEssayResult});
const submit = new SubmitEssayPracticeSession({...studentEssays, getEssayQuestionById});
async function loadEssayPracticeSession(input) {return load.execute(input);}
async function submitEssayPracticeSession(input) {return submit.execute(input);}
module.exports = {loadEssayPracticeSession, submitEssayPracticeSession};
