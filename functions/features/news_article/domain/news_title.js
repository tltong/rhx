const {createHash} = require("node:crypto");
const digest = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const normalizedNewsText = value => String(value).normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/gu, " ").trim();
const titleKey = title => normalizedNewsText(title);
const newsFactsKey = facts => digest([...new Set(facts.map(fact => normalizedNewsText(typeof fact === "string" ? fact : fact.text)))].sort());
const titleStoryId = (title, facts) => digest(["student-news-title-v1", titleKey(title), newsFactsKey(facts)]);
module.exports = {titleKey, newsFactsKey, titleStoryId};
