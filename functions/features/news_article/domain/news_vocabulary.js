const {hash, key, fail, text} = require("./news_article");
const SELECTOR_VERSION = 3, MEANING_VERSION = 2, MAX_COUNT = 50;
function count(value) {if (!Number.isInteger(value) || value < 0 || value > MAX_COUNT) throw fail("Vocabulary count must be a whole number from 0 to 50."); return value;}
const setId = value => hash([SELECTOR_VERSION, count(value)]);
const meaningId = (termId, language) => hash([MEANING_VERSION, termId, key(language)]);
const wordCharacter = value => !!value && /[\p{L}\p{N}\p{M}_]/u.test(value);
const cjk = value => !!value && /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(value);
function firstOccurrence(pages, term) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const page of [...pages].sort((a, b) => a.position - b.position)) {
    for (const match of page.text.matchAll(new RegExp(escaped, "giu"))) {
      const startOffset = match.index, endOffset = startOffset + match[0].length;
      const before = [...page.text.slice(0, startOffset)].at(-1), after = [...page.text.slice(endOffset, endOffset + 2)][0];
      const first = [...match[0]][0], last = [...match[0]].at(-1);
      if (wordCharacter(first) && !cjk(first) && wordCharacter(before) && !cjk(before)
          || wordCharacter(last) && !cjk(last) && wordCharacter(after) && !cjk(after)) continue;
      const left = page.text.slice(Math.max(0, startOffset - 300), startOffset), right = page.text.slice(endOffset, endOffset + 300);
      const boundary = /[.!?。！？\n]/u, leftParts = left.split(boundary), stop = right.search(boundary);
      return {term: match[0], pagePosition: page.position, startOffset, endOffset,
        context: (leftParts.at(-1) + match[0] + (stop < 0 ? right : right.slice(0, stop + 1))).trim()};
    }
  }
  return null;
}
function normalizeVocabulary(raw, edition, requestedCount) {
  count(requestedCount);
  if (!Array.isArray(raw?.terms) || raw.terms.length > MAX_COUNT * 2) throw fail("Vocabulary selection returned invalid terms.", "invalid-news");
  const candidates = raw.terms.map(item => {
    if (!["word", "phrase"].includes(item?.kind)) throw fail("Vocabulary terms must be words or short phrases.", "invalid-news");
    return {term: text(item.term, "vocabulary term", 120), kind: item.kind, articleMeaning: item.articleMeaning};
  }).sort((a, b) => b.term.length - a.term.length);
  const items = [], used = new Set();
  for (const candidate of candidates) {
    if (items.length >= requestedCount) break;
    const normalized = key(candidate.term); if (used.has(normalized)) continue;
    const occurrence = firstOccurrence(edition.pages, candidate.term); if (!occurrence) continue;
    if (items.some(item => item.pagePosition === occurrence.pagePosition && item.startOffset < occurrence.endOffset && occurrence.startOffset < item.endOffset)) continue;
    if (typeof candidate.articleMeaning !== "string" || !candidate.articleMeaning.trim() || candidate.articleMeaning.length > 2000) throw fail("Vocabulary selection must include a meaning in the article's language.", "invalid-news");
    items.push({...occurrence, kind: candidate.kind, articleMeaning: candidate.articleMeaning.trim(), id: "term_" + hash([normalized, occurrence.pagePosition, occurrence.startOffset]).slice(0, 20)}); used.add(normalized);
  }
  if (requestedCount && candidates.length && !items.length) throw fail("Selected vocabulary did not occur in the article.", "invalid-news");
  items.sort((a, b) => a.pagePosition - b.pagePosition || a.startOffset - b.startOffset);
  return {setId: setId(requestedCount), editionId: edition.editionId, gradeKey: edition.gradeKey, language: edition.language,
    selectorVersion: SELECTOR_VERSION, requestedCount, actualCount: items.length, status: "ready", items};
}
function normalizeMeaning(raw) {return text(raw?.meaning, "word meaning", 2000);}
module.exports = {SELECTOR_VERSION, MEANING_VERSION, MAX_COUNT, count, setId, meaningId, firstOccurrence, normalizeVocabulary, normalizeMeaning};
