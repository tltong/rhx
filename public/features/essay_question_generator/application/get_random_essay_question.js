import {normalizeCriteria} from "../domain/essay_question.js?v=20261017-essay-grade-min-words-v1";


const RANDOM_ESSAY_PAGE_SIZE = 100;
class GetRandomEssayQuestion {
  constructor(repository, random = Math.random) {Object.assign(this, {repository, random});}
  async execute(input, {assertAccess = () => {}} = {}) {
    const criteria = normalizeCriteria(input);
    let cursor = null, selected = null, count = 0;
    // Reservoir sampling is uniform across every matching stored question.
    // It reads all matches in bounded pages; no random-key schema or biased ID pivot.
    do {
      assertAccess();
      const page = await this.repository.listQuestions({...criteria, limit: RANDOM_ESSAY_PAGE_SIZE, cursor});
      assertAccess();
      for (const question of page.questions) {
        count++;
        const draw = this.random();
        if (!Number.isFinite(draw) || draw < 0 || draw >= 1) throw new Error("random must return a number from 0 inclusive to 1 exclusive.");
        if (draw < 1 / count) selected = question;
      }
      cursor = page.nextCursor;
    } while (cursor !== null);
    return selected;
  }
}


export {GetRandomEssayQuestion, RANDOM_ESSAY_PAGE_SIZE};
