const wordSegmenter = new Intl.Segmenter(undefined, {granularity: "word"});

function getEssayWordCount(essayText, minWords = null) {
  if (minWords !== null && (!Number.isSafeInteger(minWords) || minWords < 1)) {
    throw new Error("The essay minimum word count is invalid.");
  }
  let wordCount = 0;
  // Word segmentation handles languages without spaces and excludes punctuation.
  for (const segment of wordSegmenter.segment(typeof essayText === "string" ? essayText : "")) {
    if (segment.isWordLike) wordCount += 1;
  }
  return {wordCount, minWords, meetsMinimum: typeof essayText === "string" && Boolean(essayText.trim())
    && (minWords === null || wordCount >= minWords)};
}

function requireEssayMinimumWordCount(essayText, minWords) {
  const count = getEssayWordCount(essayText, minWords);
  if (!count.meetsMinimum) {
    const error = new Error(count.minWords === null
      ? "Write your essay before submitting."
      : `Your essay has ${count.wordCount} words. Write at least ${count.minWords} words before submitting.`);
    error.code = "failed-precondition";
    throw error;
  }
  return count;
}

export {getEssayWordCount, requireEssayMinimumWordCount};
