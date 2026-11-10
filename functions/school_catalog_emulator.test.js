const {test} = require("node:test"), assert = require("node:assert/strict");

test("school catalog persistence, reference validation, stable pagination, archives and concurrent edits", {skip: !process.env.FIRESTORE_EMULATOR_HOST}, async t => {
  assert.match(process.env.FIRESTORE_EMULATOR_HOST, /^(127\.0\.0\.1|localhost):\d+$/);
  assert.match(process.env.GCLOUD_PROJECT || "", /^demo-/);
  const {getFirestoreDb} = require("./utils/firebase/firebase_ops"), db = getFirestoreDb();
  const {createSchoolFeature} = require("./features/school/school_module");
  const authorize = async ({write = false}, context = {}) => {
    if (!context.auth?.uid) throw Object.assign(new Error("Sign in"), {code: "unauthenticated"});
    const administrator = context.auth.uid === "admin";
    if (write && !administrator) throw Object.assign(new Error("Administrator required"), {code: "permission-denied"});
    return {uid: context.auth.uid, administrator};
  };
  const api = createSchoolFeature({authorize});
  const admin = {auth: {uid: "admin"}}, reader = {auth: {uid: "reader"}};
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${process.env.GCLOUD_PROJECT}/databases/(default)/documents`, {method: "DELETE"});
  await db.doc("syllabusScope/Malaysia").set({country: "Malaysia", levels: {primary: {1: true}, secondary: {1: true}}});
  await db.doc("syllabusScope/Singapore").set({country: "Singapore", primary: {1: true}});
  await db.doc("streams/primary").set({country: "Malaysia", level: "primary", name: "Primary stream"});
  await db.doc("streams/secondary").set({country: "Malaysia", level: "secondary", name: "Secondary stream"});
  await db.doc("streams/foreign").set({country: "Singapore", level: "primary", name: "Foreign stream"});
  let state, town, school;
  const scope = {country: "Malaysia", level: "primary"};
  const expectError = (promise, code) => assert.rejects(promise, {code});

  await t.test("location and school APIs write server-owned records and retrieve them by ID", async () => {
    state = await api.createState({country: "Malaysia", name: "  Selangor  "}, admin);
    town = await api.createLocality({country: "Malaysia", stateId: state.id, name: "Petaling Jaya", type: "city"}, admin);
    school = await api.createSchool({...scope, stateId: state.id, localityId: town.id, name: "  Alpha   School  ", streamId: "primary", schoolCode: "ABC123"}, admin);
    assert.equal(school.name, "Alpha School"); assert.equal(school.nameNormalized, "alpha school");
    assert.equal(school.version, 1); assert.equal(school.createdBy, "admin"); assert.ok(school.updatedAt instanceof Date);
    assert.equal((await api.getSchool(school.id, reader)).schoolCode, "ABC123");
    assert.equal((await api.getState({id: state.id}, reader)).name, "Selangor");
    assert.equal((await api.getLocality(town.id, reader)).type, "city");
    assert.equal(await api.getSchool("missing", reader), null);
    assert.equal((await api.listStates({country: "Malaysia"}, reader)).items.length, 1);
    assert.equal((await api.listLocalities({country: "Malaysia", stateId: state.id}, reader)).items.length, 1);
  });
  await t.test("writes reject foreign locations, unavailable streams, unsupported levels and forged values atomically", async () => {
    const original = (await db.doc(`schools/${school.id}`).get()).data();
    for (const patch of [{streamId: "secondary"}, {streamId: "foreign"}, {streamId: "missing"}, {localityId: "missing"},
      {country: "Singapore"}, {stateId: "missing"}]) {
      await expectError(api.updateSchool({id: school.id, expectedVersion: 1, ...patch}, admin), "failed-precondition");
    }
    await expectError(api.updateSchool({id: school.id, expectedVersion: 1, updatedBy: "forged"}, admin), "invalid-argument");
    await expectError(api.createSchool({...scope, level: "tertiary"}, admin), "invalid-argument");
    assert.deepEqual((await db.doc(`schools/${school.id}`).get()).data(), original);
    await expectError(api.createState({country: "Malaysia", name: "Forbidden"}, reader), "permission-denied");
    await expectError(api.listSchools({...scope, status: "all"}, reader), "permission-denied");
    await expectError(api.getSchool(school.id), "unauthenticated");
    await expectError(api.updateState({id: state.id, expectedVersion: 1, country: "Singapore"}, admin), "failed-precondition");
  });
  await t.test("legacy country scopes and expanding Unicode name normalization remain usable", async () => {
    const state = await api.createState({country: "Singapore", name: "Singapore"}, admin);
    const town = await api.createLocality({country: "Singapore", stateId: state.id, name: "Singapore", type: "city"}, admin);
    const scope = {country: "Singapore", level: "primary", stateId: state.id, localityId: town.id};
    for (let i = 0; i < 2; i++) await api.createSchool({...scope, name: "İ".repeat(200)}, admin);
    const first = await api.listSchools({...scope, limit: 1}, reader);
    assert.equal(first.items[0].nameNormalized.length, 400);
    const second = await api.listSchools({...scope, limit: 1, cursor: first.nextCursor}, reader);
    assert.equal(second.items.length, 1); assert.notEqual(first.items[0].id, second.items[0].id);
  });
  await t.test("stream association uses dynamic definitions and supports assignment and removal", async () => {
    await db.doc("streams/primary").update({name: "Renamed primary stream"});
    await db.doc("streams/new").set({...scope, name: "New stream"});
    assert.deepEqual((await api.listSchoolStreams(scope, reader)).items.map(item => item.name), ["New stream", "Renamed primary stream"]);
    assert.equal((await api.getSchool(school.id, reader)).streamId, "primary");
    school = await api.assignSchoolStream({id: school.id, expectedVersion: school.version, streamId: "new"}, admin);
    assert.equal(school.streamId, "new");
    school = await api.removeSchoolStream({id: school.id, expectedVersion: school.version}, admin);
    assert.equal(school.streamId, null);
  });
  await t.test("cursor pagination handles equal names, Unicode prefixes, filter changes and scope isolation", async () => {
    for (const name of ["Alpha School", "Alpha School", "Alpha 😀 School", "Beta School", "Gamma School"]) {
      await api.createSchool({...scope, stateId: state.id, localityId: town.id, name}, admin);
    }
    await api.createSchool({...scope, level: "secondary", stateId: state.id, localityId: town.id, name: "Other level"}, admin);
    const ids = [], pages = []; let cursor;
    do {
      const page = await api.listSchools({...scope, stateId: state.id, localityId: town.id, limit: 2, ...(cursor ? {cursor} : {})}, reader);
      pages.push(page); ids.push(...page.items.map(item => item.id)); cursor = page.nextCursor;
    } while (cursor);
    assert.equal(ids.length, 6); assert.equal(new Set(ids).size, 6); assert.equal(pages.length, 3);
    const matches = await api.listSchools({...scope, search: "ALPHA"}, reader);
    assert.equal(matches.items.length, 4); assert.ok(matches.items.some(item => item.name.includes("😀")));
    await expectError(api.listSchools({...scope, search: "beta", cursor: pages[0].nextCursor}, reader), "invalid-argument");
    await expectError(api.listSchools({...scope, cursor: "malformed"}, reader), "invalid-argument");
    await expectError(api.listSchools({...scope, limit: 1000}, reader), "invalid-argument");
    assert.equal((await api.listSchools({...scope, streamId: "new"}, reader)).items.length, 0);
  });
  await t.test("word-prefix search finds later words with scoped filters, stable pages and safe renames", async () => {
    const country = "Wordland", base = {country, level: "primary"};
    await db.doc("syllabusScope/Wordland").set({country, levels: {primary: {1: true}, secondary: {1: true}}});
    await db.doc("streams/word-stream").set({...base, name: "Word stream"});
    const a = await api.createState({country, name: "State A"}, admin), b = await api.createState({country, name: "State B"}, admin);
    const a1 = await api.createLocality({country, stateId: a.id, name: "Town A1", type: "town"}, admin);
    const a2 = await api.createLocality({country, stateId: a.id, name: "Town A2", type: "town"}, admin);
    const b1 = await api.createLocality({country, stateId: b.id, name: "Town B1", type: "town"}, admin);
    const saved = [];
    for (const [name, stateId, localityId, streamId] of [
      ["SJKC Chung Hua", a.id, a1.id, "word-stream"], ["SK Chung Hua", a.id, a1.id, null],
      ["SJKC Chung Hua", a.id, a2.id, "word-stream"], ["SJKT Chung Huat", b.id, b1.id, "word-stream"],
    ]) saved.push(await api.createSchool({...base, name, stateId, localityId, streamId}, admin));
    const archived = await api.createSchool({...base, name: "SJKC Chung Hidden", stateId: a.id, localityId: a1.id, status: "archived"}, admin);
    await api.createSchool({...base, level: "secondary", name: "Secondary Chung Hua", stateId: b.id, localityId: b1.id}, admin);
    const query = {...base, searchMode: "wordPrefix", search: "CHUNG"};
    const ids = []; let cursor, firstCursor;
    do {
      const page = await api.listSchools({...query, limit: 1, ...(cursor ? {cursor} : {})}, reader);
      ids.push(...page.items.map(record => record.id)); cursor = page.nextCursor; firstCursor ||= cursor;
    } while (cursor);
    assert.equal(ids.length, 4); assert.equal(new Set(ids).size, 4);
    assert.deepEqual(new Set(ids), new Set(saved.map(record => record.id)));
    assert.equal((await api.listSchools({...query, search: "chu"}, reader)).items.length, 4);
    assert.equal((await api.listSchools({...query, search: "hua"}, reader)).items.length, 4);
    assert.equal((await api.listSchools({...query, search: "c"}, reader)).items.length, 4);
    assert.equal((await api.listSchools({...query, search: "chung h"}, reader)).items.length, 4);
    assert.equal((await api.listSchools({...query, search: "sjkc CHUNG hua"}, reader)).items.length, 2);
    const multiFirst = await api.listSchools({...query, search: "Hua CHUNG", limit: 1}, reader);
    const multiNext = await api.listSchools({...query, search: "chung hua chung", limit: 1, cursor: multiFirst.nextCursor}, reader);
    assert.notEqual(multiFirst.items[0].id, multiNext.items[0].id);
    assert.equal(multiFirst.items[0].stateName, "State A");
    assert.equal(multiFirst.items[0].localityName.startsWith("Town A"), true);
    assert.equal((await api.listSchools({...query, search: "ung"}, reader)).items.length, 0);
    assert.equal((await api.listSchools({...query, searchMode: "namePrefix"}, reader)).items.length, 0);
    assert.equal((await api.listSchools({...query, stateId: a.id}, reader)).items.length, 3);
    assert.equal((await api.listSchools({...query, stateId: a.id, localityId: a1.id}, reader)).items.length, 2);
    assert.equal((await api.listSchools({...query, streamId: "word-stream"}, reader)).items.length, 3);
    assert.equal((await api.listSchools({...query, status: "all"}, admin)).items.length, 5);
    assert.equal((await api.listSchools({...query, status: "archived"}, admin)).items[0].id, archived.id);
    assert.equal((await api.listSchools({...query, level: "secondary"}, reader)).items.length, 1);
    assert.equal((await api.listSchools({...query, country: "Malaysia"}, reader)).items.length, 0);
    for (const patch of [{searchMode: "namePrefix"}, {search: "chu"}, {stateId: a.id}]) {
      await expectError(api.listSchools({...query, ...patch, cursor: firstCursor}, reader), "invalid-argument");
    }
    await expectError(api.updateSchool({id: saved[2].id, expectedVersion: 1, searchPrefixes: ["forged"]}, admin), "invalid-argument");
    const renamed = await api.updateSchool({id: saved[2].id, expectedVersion: 1, name: "SJKC Sin Min"}, admin);
    assert.equal(renamed.searchPrefixes.includes("chung"), false);
    assert.equal((await api.listSchools(query, reader)).items.length, 3);
    assert.equal((await api.listSchools({...query, search: "sin"}, reader)).items[0].id, renamed.id);
    assert.equal((await api.listSchools({...query, search: ""}, reader)).items.length, 4);
    assert.equal((await db.doc(`schools/${renamed.id}`).get()).data().searchPrefixes.includes("sin"), true);
    assert.equal((await db.doc(`schools/${renamed.id}`).get()).data().stateName, undefined);
  });
  await t.test("multi-word candidate scans are bounded and cursors retain matches after empty pages", async () => {
    const {schoolSearchPrefixes} = require("./features/school/domain/school_search");
    const country = "Scanland", references = [], batch = db.batch();
    for (let index = 0; index < 208; index++) {
      const reference = db.collection("schools").doc("scan-" + String(index).padStart(3, "0")); references.push(reference);
      const name = index < 205 ? "Anchor Candidate " + String(index).padStart(3, "0") : "Anchor Zebra " + index;
      batch.set(reference, {country, level: "primary", name, nameNormalized: name.toLowerCase(), searchPrefixes: schoolSearchPrefixes(name), status: "active"});
    }
    await batch.commit();
    try {
      const input = {country, level: "primary", search: "anchor z", searchMode: "wordPrefix", limit: 2};
      const first = await api.listSchools(input, reader);
      assert.equal(first.items.length, 0); assert.ok(first.nextCursor);
      assert.equal(JSON.parse(Buffer.from(first.nextCursor, "base64url").toString()).id, "scan-199");
      const second = await api.listSchools({...input, cursor: first.nextCursor}, reader);
      assert.equal(second.items.length, 2); assert.ok(second.nextCursor);
      const last = await api.listSchools({...input, cursor: second.nextCursor}, reader);
      assert.equal(last.items.length, 1); assert.equal(last.nextCursor, null);
      assert.equal(new Set([...second.items, ...last.items].map(item => item.id)).size, 3);
    } finally {const cleanup = db.batch(); references.forEach(reference => cleanup.delete(reference)); await cleanup.commit();}
  });
  await t.test("concurrent edits cannot overwrite a record with a stale version", async () => {
    const result = await Promise.allSettled(["First edit", "Second edit"].map(name => api.updateSchool({id: school.id, expectedVersion: school.version, name}, admin)));
    assert.equal(result.filter(item => item.status === "fulfilled").length, 1);
    assert.equal(result.find(item => item.status === "rejected").reason.code, "aborted");
    school = await api.getSchool(school.id, admin);
    assert.equal(school.version, 4);
  });
  await t.test("archives preserve references, hide records from readers, and enforce active child dependencies", async () => {
    await expectError(api.archiveState({id: state.id, expectedVersion: state.version}, admin), "failed-precondition");
    await expectError(api.archiveLocality({id: town.id, expectedVersion: town.version}, admin), "failed-precondition");
    school = await api.archiveSchool({id: school.id, expectedVersion: school.version}, admin);
    assert.equal(await api.getSchool(school.id, reader), null);
    assert.equal((await api.getSchool(school.id, admin)).status, "archived");
    assert.equal((await api.listSchools({...scope, status: "archived"}, admin)).items.length, 1);
    for (const doc of (await db.collection("schools").where("status", "==", "active").get()).docs) {
      await api.archiveSchool({id: doc.id, expectedVersion: doc.data().version}, admin);
    }
    town = await api.archiveLocality({id: town.id, expectedVersion: town.version}, admin);
    state = await api.archiveState({id: state.id, expectedVersion: state.version}, admin);
    await expectError(api.updateSchool({id: school.id, expectedVersion: school.version, status: "active"}, admin), "failed-precondition");
    state = await api.updateState({id: state.id, expectedVersion: state.version, status: "active"}, admin);
    town = await api.updateLocality({id: town.id, expectedVersion: town.version, status: "active"}, admin);
    school = await api.updateSchool({id: school.id, expectedVersion: school.version, status: "active"}, admin);
    assert.equal((await api.getSchool(school.id, reader)).localityId, town.id);
  });
  await t.test("a concurrent child create and parent archive preserve the hierarchy", async () => {
    const parent = await api.createState({country: "Malaysia", name: "Concurrent state"}, admin);
    const results = await Promise.allSettled([
      api.createLocality({country: "Malaysia", stateId: parent.id, name: "Concurrent town", type: "town"}, admin),
      api.archiveState({id: parent.id, expectedVersion: parent.version}, admin),
    ]);
    assert.equal(results.filter(item => item.status === "fulfilled").length, 1);
    assert.equal(results.find(item => item.status === "rejected").reason.code, "failed-precondition");
  });
});
