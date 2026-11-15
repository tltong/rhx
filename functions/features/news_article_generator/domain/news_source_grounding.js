const {url, fail} = require("../../news_article/domain/news_article");

function articleIdentity(address) {
  const parsed = new URL(address);
  // AT Internet attribution tags do not select article content. A model may
  // return the clean link after the tool opened a tagged link. Keep every other
  // query parameter and return the actual retrieved URL after matching.
  for (const parameter of [...parsed.searchParams.keys()]) if (/^at_(medium|campaign)$/i.test(parameter)) parsed.searchParams.delete(parameter);
  // AP serves both /article/<id> and /article/<headline>-<id>. Match only
  // its complete, publisher-specific identifier, never a hostname alone.
  if (["apnews.com", "www.apnews.com"].includes(parsed.hostname) && !parsed.search) {
    const match = parsed.pathname.match(/^\/article\/(?:[a-z0-9]+(?:-[a-z0-9]+)*-)?([a-f0-9]{32})\/?$/i);
    if (match) return "apnews:" + match[1].toLowerCase();
  }
  return parsed.href;
}

function retrievedNewsUrls(response) {
  const retrieved = new Set();
  function add(address) {
    try {
      const normalized = url(address);
      retrieved.add(normalized);
    } catch { /* Ignore malformed provider citations. */ }
  }
  for (const item of response.output || []) {
    if (item.type === "web_search_call" && item.status === "completed") {
      for (const source of item.action?.sources || []) if (source.url) add(source.url);
      if (["open_page", "find_in_page"].includes(item.action?.type) && item.action.url) add(item.action.url);
    }
    if (item.type === "message" && item.status === "completed") {
      for (const content of item.content || []) for (const citation of content.annotations || []) {
        if (citation.type === "url_citation" && citation.url) add(citation.url);
      }
    }
  }
  return [...retrieved];
}

function groundNewsSources(result, response) {
  const retrieved = new Set(retrievedNewsUrls(response)), identities = new Map();
  for (const address of retrieved) {
    const identity = articleIdentity(address);
    if (!identities.has(identity)) identities.set(identity, address);
  }
  function resolve(address) {
    try {
      const normalized = url(address);
      return retrieved.has(normalized) ? normalized : identities.get(articleIdentity(normalized)) || null;
    } catch {return null;}
  }
  if (!Array.isArray(result?.sources) || !result.sources.length) throw fail("News sources were not grounded in the completed web search.", "invalid-news");
  const sources = [], sourceIds = new Map();
  result.sources.forEach((source, index) => {
    const address = resolve(source?.url);
    if (!address) return;
    let selected = sources.findIndex(source => source.url === address);
    if (selected < 0) {selected = sources.length; sources.push({...source, url: address});}
    sourceIds.set("s" + (index + 1), "s" + (selected + 1));
  });
  const facts = (result.facts || []).flatMap(fact => {
    const retained = [...new Set((fact.sourceIds || []).map(id => sourceIds.get(id)).filter(Boolean))];
    return retained.length ? [{...fact, sourceIds: retained}] : [];
  });
  const diagnostics = {requestedSourceCount: result.sources.length, verifiedSourceCount: sources.length, retainedFactCount: facts.length};
  if (!sources.length || facts.length < 2) throw Object.assign(fail("News sources were not grounded in the completed web search.", "invalid-news"), {sourceGroundingDiagnostics: diagnostics});
  const requestedCanonical = resolve(result.canonicalUrl), canonicalUrl = sources.some(source => source.url === requestedCanonical) ? requestedCanonical : sources[0].url;
  // Use the retained primary source's headline if the original primary source
  // was discarded. No source or fact supported only by an unverified link survives.
  const title = canonicalUrl === requestedCanonical && sourceIds.size === result.sources.length ? result.title : sources.find(source => source.url === canonicalUrl).title;
  if (title !== result.title || sourceIds.size !== result.sources.length || canonicalUrl !== requestedCanonical) {
    const {canonicalTitle, ...retained} = result; return {...retained, title, sources, facts, canonicalUrl};
  }
  return {...result, title, sources, facts, canonicalUrl};
}
module.exports = {groundNewsSources, retrievedNewsUrls};
