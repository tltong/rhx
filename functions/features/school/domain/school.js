const {schoolSearchPrefixes, wordPrefixQuery} = require("./school_search");
const COLLECTIONS = Object.freeze({state: "schoolStates", locality: "schoolLocalities", school: "schools", stream: "streams"});
function problem(message, code = "invalid-argument") {return Object.assign(new Error(message), {code});}
function object(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw problem("Provide an input object.");
  return input;
}
function text(value, field, {optional = false, max = 200} = {}) {
  if (optional && (value === undefined || value === null || value === "")) return "";
  if (typeof value !== "string") throw problem(`${field} must be text.`);
  const result = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
  if (optional && !result) return "";
  if (!result || result.length > max) throw problem(`${field} must contain 1–${max} characters.`);
  return result;
}
function identifier(value, field = "id") {
  const result = text(value, field, {max: 200});
  if (result.includes("/") || result === "." || result === "..") throw problem(`${field} is invalid.`);
  return result;
}
function nameKey(value) {return value.normalize("NFKC").toLowerCase().trim().replace(/\s+/gu, " ");}
function status(value = "active", allowAll = false) {
  if (!["active", "archived", ...(allowAll ? ["all"] : [])].includes(value)) throw problem("Choose active or archived status.");
  return value;
}
function level(value) {
  if (!["primary", "secondary"].includes(value)) throw problem("Choose primary or secondary level.");
  return value;
}
function version(value) {
  if (!Number.isSafeInteger(value) || value < 1) throw problem("expectedVersion must be the saved record's version.");
  return value;
}
function changes(kind, input, current = null) {
  object(input);
  const permitted = {state: ["name", "country", "status"], locality: ["name", "country", "stateId", "type", "status"],
    school: ["name", "country", "level", "stateId", "localityId", "schoolCode", "streamId", "status"]}[kind];
  for (const key of Object.keys(input)) if (![...permitted, "id", "expectedVersion"].includes(key)) throw problem(`Unexpected field: ${key}.`);
  const data = {...current, ...input};
  const result = {name: text(data.name, "name"), country: text(data.country, "country"), status: status(data.status)};
  result.nameNormalized = nameKey(result.name);
  if (kind !== "state") result.stateId = identifier(data.stateId, "stateId");
  if (kind === "locality") {
    if (!["city", "town"].includes(data.type)) throw problem("Choose city or town.");
    result.type = data.type;
  }
  if (kind === "school") Object.assign(result, {level: level(data.level), localityId: identifier(data.localityId, "localityId"),
    schoolCode: text(data.schoolCode, "schoolCode", {optional: true, max: 80}),
    streamId: data.streamId === undefined || data.streamId === null || data.streamId === "" ? null : identifier(data.streamId, "streamId"),
    searchPrefixes: schoolSearchPrefixes(result.name)});
  if (current && kind !== "school" && (result.country !== current.country || (kind === "locality" && result.stateId !== current.stateId))) {
    throw problem("A location's country and parent state cannot change. Create a new location instead.", "failed-precondition");
  }
  return result;
}
function listInput(kind, raw = {}, administrator = false) {
  const input = object(raw), filters = {country: text(input.country, "country")};
  const permitted = ["country", "status", "search", "limit", "cursor", ...(kind === "school" ? ["level", "stateId", "localityId", "streamId", "searchMode"] : kind === "locality" ? ["stateId"] : kind === "stream" ? ["level"] : [])];
  for (const key of Object.keys(input)) if (!permitted.includes(key)) throw problem(`Unexpected filter: ${key}.`);
  if (kind === "school" || kind === "stream") filters.level = level(input.level);
  if (kind === "locality") filters.stateId = identifier(input.stateId, "stateId");
  if (kind === "school") {
    if (input.stateId) filters.stateId = identifier(input.stateId, "stateId");
    if (input.localityId) {
      if (!filters.stateId) throw problem("Select a state before filtering by city/town.");
      filters.localityId = identifier(input.localityId, "localityId");
    }
    if (input.streamId) filters.streamId = identifier(input.streamId, "streamId");
  }
  if (kind !== "stream") {
    const selectedStatus = status(input.status, true);
    if (!administrator && selectedStatus !== "active") throw problem("Only administrators can read archived records.", "permission-denied");
    if (selectedStatus !== "all") filters.status = selectedStatus;
  }
  const limit = input.limit === undefined ? 50 : input.limit;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw problem("limit must be between 1 and 100.");
  const searchMode = input.searchMode === undefined ? "namePrefix" : input.searchMode;
  if (!["namePrefix", "wordPrefix"].includes(searchMode)) throw problem("Choose namePrefix or wordPrefix search mode.");
  const normalizedSearch = nameKey(text(input.search, "search", {optional: true}));
  const search = searchMode === "wordPrefix" ? wordPrefixQuery(normalizedSearch) : normalizedSearch;
  const searchTerms = searchMode === "wordPrefix" && search ? search.split(" ") : [];
  const searchAnchor = searchTerms.reduce((longest, term) => Array.from(term).length > Array.from(longest).length ? term : longest, "");
  // Stream names predate normalized directory names. Stream options use their saved name ordering.
  if (kind === "stream" && search) throw problem("Stream options do not support name-prefix filtering.");
  // Preserve existing name-prefix cursors; broader searches have a separate scope.
  const scope = JSON.stringify({kind, filters, search, ...(searchMode === "wordPrefix" ? {searchMode} : {})});
  let after = null;
  if (input.cursor !== undefined && input.cursor !== null) {
    try {
      if (typeof input.cursor !== "string" || input.cursor.length > 8192) throw new Error();
      const decoded = JSON.parse(Buffer.from(input.cursor, "base64url").toString("utf8"));
      if (decoded.scope !== scope || typeof decoded.name !== "string" || decoded.name.length > 1500) throw new Error();
      after = {name: decoded.name, id: identifier(decoded.id)};
    } catch {throw problem("Invalid cursor. Restart the list after changing filters.");}
  }
  return {filters, search, searchMode, searchTerms, searchAnchor, limit, after, scope, sort: kind === "stream" ? "name" : "nameNormalized"};
}
function nextCursor(query, record) {
  return Buffer.from(JSON.stringify({scope: query.scope, name: record[query.sort], id: record.id})).toString("base64url");
}
function toRecord(snapshot) {
  if (!snapshot.exists) return null;
  const data = snapshot.data();
  for (const field of ["createdAt", "updatedAt"]) if (data[field]?.toDate) data[field] = data[field].toDate();
  return {...data, id: snapshot.id};
}
module.exports = {COLLECTIONS, problem, object, text, identifier, nameKey, level, version, changes, listInput, nextCursor, toRecord};
