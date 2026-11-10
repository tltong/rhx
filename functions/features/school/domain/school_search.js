const MIN_WORD_PREFIX_LENGTH = 1;
const MAX_WORD_PREFIX_LENGTH = 80;
function words(value) {
  return value.normalize("NFKC").toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{M}\p{N}]*/gu) || [];
}
function schoolSearchPrefixes(name) {
  const prefixes = new Set();
  for (const word of words(name)) {
    const points = Array.from(word);
    let prefix = "";
    for (let length = 1; length <= Math.min(points.length, MAX_WORD_PREFIX_LENGTH); length++) {
      prefix += points[length - 1];
      prefixes.add(prefix);
    }
  }
  return [...prefixes].sort();
}
function wordPrefixQuery(value) {
  if (!value) return "";
  const tokens = [...new Set(words(value))].sort();
  if (!tokens.length || tokens.some(token => Array.from(token).length > MAX_WORD_PREFIX_LENGTH)) {
    throw Object.assign(new Error(`Search words must contain ${MIN_WORD_PREFIX_LENGTH}–${MAX_WORD_PREFIX_LENGTH} letters or numbers.`), {code: "invalid-argument"});
  }
  return tokens.join(" ");
}
module.exports = {schoolSearchPrefixes, wordPrefixQuery, MIN_WORD_PREFIX_LENGTH, MAX_WORD_PREFIX_LENGTH};
