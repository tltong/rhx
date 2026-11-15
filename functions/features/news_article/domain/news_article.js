const {createHash} = require("node:crypto");
const {countStoryWords} = require("./news_word_count");
const {titleKey, newsFactsKey, titleStoryId} = require("./news_title");
const fail = (message, code = "invalid-argument") => Object.assign(new Error(message), {code});
function canonical(value) {
  if (value?.toDate) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => [key, canonical(value[key])]));
  return value;
}
const hash = value => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
function text(value, name, max = 1000, empty = false) {
  if (typeof value !== "string" || value.length > max || !empty && !value.trim()) throw fail("Invalid " + name + ".");
  return value.trim();
}
function id(value, name = "ID") {const result = text(value, name, 128); if (!/^[A-Za-z0-9_-]+$/.test(result)) throw fail("Invalid " + name + "."); return result;}
function url(value) {
  let parsed; try {parsed = new URL(value);} catch {throw fail("Invalid source URL.");}
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port || !parsed.hostname.includes(".") || /^(localhost|127\.|10\.|192\.168\.|169\.254\.)/.test(parsed.hostname)) throw fail("Sources must use public HTTPS URLs.");
  parsed.hash = "";
  for (const key of [...parsed.searchParams.keys()]) if (/^(utm_|fbclid|gclid)/i.test(key)) parsed.searchParams.delete(key);
  return parsed.href;
}
const key = value => text(value, "value", 200).normalize("NFKC").toLowerCase();
function scope(newsType, country) {
  if (!["international", "local"].includes(newsType)) throw fail("Choose international or local news.");
  return newsType === "international" ? "international" : "local:" + key(country);
}
function normalizeStory(raw, criteria, now = new Date()) {
  if (!Array.isArray(raw?.sources) || !raw.sources.length || raw.sources.length > 8) throw fail("News needs supporting sources.", "invalid-news");
  const sources = raw.sources.map((source, index) => {
    const publishedAt = new Date(source.publishedAt);
    if (!Number.isFinite(publishedAt.getTime()) || publishedAt.getTime() > now.getTime() + 86400000) throw fail("News publication date is invalid.", "invalid-news");
    return {id: "s" + (index + 1), url: url(source.url), title: text(source.title, "source title", 500), publisher: text(source.publisher, "publisher", 200), publishedAt: publishedAt.toISOString()};
  });
  if (!Array.isArray(raw.facts) || raw.facts.length < 2 || raw.facts.length > 24) throw fail("News needs a supported factual brief.", "invalid-news");
  const facts = raw.facts.map((fact, index) => {
    if (!Array.isArray(fact.sourceIds) || !fact.sourceIds.length || fact.sourceIds.some(id => !sources.some(source => source.id === id))) throw fail("A news fact has no valid citation.", "invalid-news");
    return {id: "f" + (index + 1), text: text(fact.text, "fact", 2000), sourceIds: [...new Set(fact.sourceIds)]};
  });
  const canonicalStoryKey = url(raw.canonicalUrl || sources[0].url), canonicalTitle = text(raw.canonicalTitle || raw.title, "canonical story title", 500);
  const storyId = titleStoryId(canonicalTitle, facts);
  return {storyId, canonicalStoryKey, newsType: criteria.newsType, country: criteria.newsType === "local" ? criteria.country : null,
    poolScope: scope(criteria.newsType, criteria.country), sourceTitle: text(raw.title, "story title", 500), canonicalTitle,
    titleKey: titleKey(canonicalTitle), newsFactsKey: newsFactsKey(facts), identityVersion: 1, canonicalTitleLanguage: raw.canonicalTitle ? "English" : null, facts, sources,
    publishedAt: new Date(sources[0].publishedAt), discoveredAt: now, revision: 1, status: "active", factsHash: hash(facts)};
}
function normalizeDraft(raw, settings, story, base = null, {allowWordCountMismatch = false} = {}) {
  if (!Array.isArray(raw?.pages) || raw.pages.length !== settings.pageCount) throw fail("The generated article has the wrong page count.", "invalid-news");
  const knownFacts = new Set(story.facts.map(fact => fact.id));
  const checkFacts = values => {
    if (!Array.isArray(values) || !values.length || values.some(value => !knownFacts.has(value))) throw fail("Generated content must reference the shared facts.", "invalid-news");
    return [...new Set(values)];
  };
  const plans = base ? base.imagePlans : raw.imagePlans;
  if (!Array.isArray(plans) || plans.length !== settings.photoCount) throw fail("The generated article has the wrong image count.", "invalid-news");
  const imagePlans = plans.map(plan => {
    const terms = Array.isArray(plan.searchTerms) && plan.searchTerms.length > 0 && plan.searchTerms.length <= 8
      && plan.searchTerms.every(term => typeof term === "string" && term.trim()) ? plan.searchTerms.join(" ") : plan.searchTerms;
    return {description: text(plan.description, "image scene", 2500), searchTerms: text(terms, "image search", 250), factIds: checkFacts(plan.factIds)};
  });
  const used = new Set();
  const pages = raw.pages.map((page, index) => {
    const content = text(page.text, "page text", 80000, true);
    if (!allowWordCountMismatch && settings.targetWordCount === 0 && content) throw fail("Picture-only articles cannot contain story text.", "invalid-news");
    const imageIndices = base ? base.pages[index].imageIndices : page.imageIndices;
    if (!Array.isArray(imageIndices) || new Set(imageIndices).size !== imageIndices.length || imageIndices.some(value => !Number.isInteger(value) || value < 0 || value >= imagePlans.length || used.has(value))) throw fail("Invalid page image placement.", "invalid-news");
    imageIndices.forEach(value => used.add(value));
    if (settings.articleTypeId === "pictureStory" && imageIndices.length !== 1) throw fail("Each picture-story page needs one image.", "invalid-news");
    return {position: index + 1, text: content, factIds: checkFacts(page.factIds), imageIndices,
      altTexts: imageIndices.map((_, imageIndex) => text(page.altTexts?.[imageIndex] || imagePlans[imageIndices[imageIndex]].description, "alternative text", 2500))};
  });
  if (pages.reduce((sum, page) => sum + page.text.length, 0) > 200000) throw fail("The generated article is too large.", "invalid-news");
  if (used.size !== settings.photoCount || !allowWordCountMismatch && settings.targetWordCount > 0 && !pages.some(page => page.text)) throw fail("The generated article is incomplete.", "invalid-news");
  return {title: text(raw.title, "article title", 500), pages, imagePlans,
    actualWordCount: countStoryWords(pages)};
}
function editionKeys(story, settings, language) {
  const baseKey = hash([story.storyId, story.revision, settings]);
  return {baseKey, reuseKey: hash([baseKey, key(language)])};
}
function publicArticle(story, edition) {
  return {storyId: story.storyId, editionId: edition.editionId, newsType: story.newsType, country: story.country,
    title: edition.title, language: edition.language, gradeKey: edition.gradeKey, articleTypeId: edition.articleTypeId,
    publishedAt: story.publishedAt, sources: story.sources, targetWordCount: edition.targetWordCount, actualWordCount: edition.actualWordCount,
    photoFallbackUsed: edition.photoFallbackUsed, actualPhotoType: edition.actualPhotoType,
    pages: edition.pages.map(page => ({position: page.position, text: page.text, images: page.imageIndices.map((index, offset) => {
      const image = edition.images[index];
      return {url: image.url, altText: page.altTexts[offset], sourceType: image.sourceType, credit: image.credit || "AI-generated illustration",
        sourceUrl: image.sourceUrl || null, license: image.license || null, licenseUrl: image.licenseUrl || null, representative: image.sourceType === "web"};
    })}))};
}
module.exports = {fail, hash, text, id, url, key, scope, normalizeStory, normalizeDraft, editionKeys, publicArticle};
