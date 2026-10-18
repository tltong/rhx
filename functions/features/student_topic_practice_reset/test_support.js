const assert = require("node:assert/strict");

// In-memory Firestore test double: atomic transactions and missing-parent traversal.
function fakeFirestore(initial = {}) {
  const documents = new Map(Object.entries(structuredClone(initial)));
  let nextId = 0, queue = Promise.resolve();
  const controls = {beforeCommit: null};
  const snapshot = ref => {
    const data = structuredClone(documents.get(ref.path));
    return {id: ref.id, ref, exists: data !== undefined, data: () => structuredClone(data)};
  };
  function document(path) {
    return {path, id: path.split("/").at(-1), collection: name => collection(path + "/" + name),
      async get() {return snapshot(this);},
      async set(data, options) {return db.runTransaction(async tx => tx.set(this, data, options));},
      async update(data) {return db.runTransaction(async tx => tx.update(this, data));},
      async listCollections() {
        const depth = path.split("/").length;
        return [...new Set([...documents.keys()].filter(key => key.startsWith(path + "/"))
          .map(key => key.split("/")[depth]))].sort().map(name => collection(path + "/" + name));
      },
    };
  }
  function collection(path) {
    return {path, doc: id => document(path + "/" + (id ?? "auto-" + ++nextId)),
      async get() {
        return {docs: [...documents.keys()].filter(key => key.startsWith(path + "/") && key.split("/").length === path.split("/").length + 1)
          .sort().map(key => snapshot(document(key)))};
      },
      async listDocuments() {
        const depth = path.split("/").length;
        return [...new Set([...documents.keys()].filter(key => key.startsWith(path + "/"))
          .map(key => key.split("/")[depth]))].sort().map(id => document(path + "/" + id));
      },
    };
  }
  const db = {collection, doc: document, runTransaction(operation) {
    const run = queue.then(async () => {
      const writes = [];
      const tx = {
        async get(ref) {assert.equal(writes.length, 0, "Firestore reads must precede transaction writes"); return snapshot(ref);},
        set(ref, data, options) {writes.push({path: ref.path, data: structuredClone(data), merge: options?.merge});},
        update(ref, data) {if (!documents.has(ref.path)) throw new Error("Missing document"); writes.push({path: ref.path, data: structuredClone(data), merge: true});},
        delete(ref) {writes.push({path: ref.path, delete: true});},
      };
      const result = await operation(tx);
      await controls.beforeCommit?.(writes);
      for (const write of writes) {
        if (write.delete) documents.delete(write.path);
        else documents.set(write.path, write.merge ? {...documents.get(write.path), ...write.data} : write.data);
      }
      return result;
    });
    queue = run.catch(() => {});
    return run;
  }};
  return {db, documents, controls};
}
function deferred() {let resolve; const promise = new Promise(yes => {resolve = yes;}); return {promise, resolve};}
module.exports = {fakeFirestore, deferred};
