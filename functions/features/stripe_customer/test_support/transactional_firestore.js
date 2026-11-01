// Small Firestore double with staged writes and optimistic conflict retries.
// Tests can commit a webhook between transaction reads and commit to exercise
// the same interleaving that Firestore resolves by rerunning the transaction.
function makeTransactionalFirestore() {
  const store = new Map();
  const versions = new Map();
  const memory = {store, transactionAttempts: 0, beforeCommit: null};
  const pathFor = (collection, id) => `${collection}/${id}`;

  memory.put = (path, data) => {
    store.set(path, structuredClone(data));
    versions.set(path, (versions.get(path) || 0) + 1);
  };
  memory.remove = (path) => {
    store.delete(path);
    versions.set(path, (versions.get(path) || 0) + 1);
  };

  memory.dependencies = {
    getDocumentRef: (collection, id) => ({path: pathFor(collection, id)}),
    getFirestoreDb: () => ({
      collectionGroup(collectionId) {
        const clauses = [], orders = [];
        let maximum = Infinity;
        const field = (data, name) => name.split(".").reduce((value, key) => value?.[key], data);
        const query = {
          where(name, operator, value) {clauses.push({name, operator, value}); return query;},
          orderBy(name) {orders.push(name); return query;},
          limit(value) {maximum = value; return query;},
          async get() {
            const docs = [...store].filter(([path]) => path.split("/").at(-2) === collectionId)
              .filter(([, data]) => clauses.every(({name, operator, value}) => {
                const actual = field(data, name);
                if (actual == null) return false;
                if (operator === "<=") return actual <= value;
                if (operator === "==") return actual === value;
                throw Error("Unsupported test query operator");
              })).sort((a, b) => {
                for (const name of orders) {
                  const first = field(a[1], name), second = field(b[1], name);
                  if (first < second) return -1;
                  if (first > second) return 1;
                }
                return a[0].localeCompare(b[0]);
              }).slice(0, maximum).map(([path, data]) => ({id: path.split("/").at(-1), ref: {path}, data: () => structuredClone(data)}));
            return {docs};
          },
        };
        return query;
      },
      async runTransaction(callback) {
        for (let attempt = 0; attempt < 8; attempt++) {
          memory.transactionAttempts++;
          const reads = new Map();
          const writes = [];
          const result = await callback({
            async get({path}) {
              reads.set(path, versions.get(path) || 0);
              const data = structuredClone(store.get(path));
              return {exists: data !== undefined, data: () => data};
            },
            set({path}, data) {
              writes.push({path, data});
            },
          });

          await memory.beforeCommit?.();
          if ([...reads].some(([path, version]) =>
            (versions.get(path) || 0) !== version)) {
            continue;
          }
          for (const {path, data} of writes) memory.put(path, data);
          return result;
        }
        throw new Error("Test transaction exhausted its conflict retries.");
      },
    }),
    async readDocument(collection, id, {includeId = true} = {}) {
      const data = structuredClone(store.get(pathFor(collection, id)));
      return data === undefined ? null : includeId ? {...data, id} : data;
    },
    async writeDocument(collection, id, data, {merge = true} = {}) {
      const path = pathFor(collection, id);
      memory.put(path, merge ? {...store.get(path), ...data} : data);
    },
  };

  return memory;
}

module.exports = {makeTransactionalFirestore};
