const {FieldPath} = require("firebase-admin/firestore");
const {getFirestoreDb} = require("../../../utils/firebase/firebase_ops");
const {COLLECTIONS, toRecord, nextCursor} = require("../domain/school");
class FirestoreSchoolRepository {
  constructor({getDb = getFirestoreDb} = {}) {this.getDb = getDb;}
  async get(kind, id) {return toRecord(await this.getDb().collection(COLLECTIONS[kind]).doc(id).get());}
  async list(kind, input) {
    let query = this.getDb().collection(COLLECTIONS[kind]);
    for (const [field, value] of Object.entries(input.filters)) query = query.where(field, "==", value);
    query = query.orderBy(input.sort).orderBy(FieldPath.documentId());
    if (input.search && input.searchMode === "wordPrefix") {
      query = query.where("searchPrefixes", "array-contains", input.searchAnchor);
    } else if (input.search) {
      query = query.where(input.sort, ">=", input.search);
      const end = prefixEnd(input.search);
      if (end !== null) query = query.where(input.sort, "<", end);
    }
    if (input.searchTerms.length > 1) return this.listWordMatches(query, input);
    if (input.after) query = query.startAfter(input.after.name, input.after.id);
    const docs = (await query.limit(input.limit + 1).get()).docs;
    const items = docs.slice(0, input.limit).map(toRecord);
    const hasMore = docs.length > input.limit;
    return {items, nextCursor: hasMore ? nextCursor(input, items[items.length - 1]) : null};
  }
  async listWordMatches(query, input) {
    // Firestore supports one array-contains filter. Use the longest word to
    // narrow candidates, then require every word. Bound work per request and
    // carry the last consumed candidate in the cursor, even on an empty page.
    const items = [], scanLimit = 200, batchSize = Math.min(50, Math.max(20, input.limit));
    let consumed = 0, after = input.after;
    while (consumed < scanLimit) {
      const take = Math.min(batchSize, scanLimit - consumed);
      const page = after ? query.startAfter(after.name, after.id) : query;
      const docs = (await page.limit(take + 1).get()).docs;
      for (let index = 0; index < Math.min(take, docs.length); index++) {
        const record = toRecord(docs[index]), prefixes = new Set(record.searchPrefixes || []);
        after = {name: record[input.sort], id: record.id}; consumed++;
        if (input.searchTerms.every(term => prefixes.has(term))) items.push(record);
        if (items.length === input.limit) {
          return {items, nextCursor: index < docs.length - 1 ? nextCursor(input, record) : null};
        }
      }
      if (docs.length <= take) return {items, nextCursor: null};
    }
    return {items, nextCursor: nextCursor(input, {[input.sort]: after.name, id: after.id})};
  }
  async withLocationNames(items) {
    const db = this.getDb(), paths = new Set();
    const valid = value => typeof value === "string" && value && !value.includes("/");
    for (const item of items) {
      if (valid(item.stateId)) paths.add("schoolStates/" + item.stateId);
      if (valid(item.localityId)) paths.add("schoolLocalities/" + item.localityId);
    }
    const documents = paths.size ? await db.getAll(...[...paths].map(path => db.doc(path))) : [];
    const names = new Map(documents.filter(doc => doc.exists).map(doc => [doc.ref.path, doc.data().name]));
    return items.map(item => ({...item, stateName: names.get("schoolStates/" + item.stateId) || null,
      localityName: names.get("schoolLocalities/" + item.localityId) || null}));
  }
  transaction(execute) {
    const db = this.getDb();
    return db.runTransaction(async transaction => {
      const ref = (kind, id) => db.collection(COLLECTIONS[kind]).doc(id);
      return execute({
        get: async (kind, id) => toRecord(await transaction.get(ref(kind, id))),
        find: async (kind, filters) => {
          let query = db.collection(COLLECTIONS[kind]);
          for (const [field, value] of Object.entries(filters)) query = query.where(field, "==", value);
          return (await transaction.get(query.limit(1))).docs.map(toRecord);
        },
        scope: async country => {
          const snapshot = await transaction.get(db.collection("syllabusScope").where("country", "==", country).limit(1));
          return snapshot.docs[0]?.data() || null;
        },
        allocate: kind => db.collection(COLLECTIONS[kind]).doc().id,
        set: (kind, id, data) => transaction.set(ref(kind, id), data),
      });
    });
  }
}
// Increment the final Unicode code point, so every suffix is included (including emoji).
function prefixEnd(prefix) {
  const points = Array.from(prefix);
  while (points.length) {
    const point = points.pop().codePointAt(0);
    if (point < 0x10ffff) return points.join("") + String.fromCodePoint(point === 0xd7ff ? 0xe000 : point + 1);
  }
  return null;
}
module.exports = {FirestoreSchoolRepository, prefixEnd};
