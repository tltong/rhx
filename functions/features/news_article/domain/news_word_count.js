const wordCountRange = target => ({minimum: Math.ceil(target * 9 / 10), maximum: Math.floor(target * 11 / 10)});
function countStoryWords(pages) {
  const segmenter = new Intl.Segmenter(undefined, {granularity: "word"});
  return [...segmenter.segment(pages.map(page => page.text).join(" "))].filter(part => part.isWordLike).length;
}
function meetsWordCount(draft, target) {
  const {minimum, maximum} = wordCountRange(target);
  return draft.actualWordCount >= minimum && draft.actualWordCount <= maximum
    && (target !== 0 || !draft.pages?.some(page => page.text.trim()));
}
function closestDraft(original, revised, target) {
  if (!original) return revised;
  if (!revised) return original;
  return Math.abs(revised.actualWordCount - target) < Math.abs(original.actualWordCount - target) ? revised : original;
}
module.exports = {wordCountRange, countStoryWords, meetsWordCount, closestDraft};
