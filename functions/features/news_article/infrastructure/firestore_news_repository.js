const {randomUUID} = require("node:crypto");
const {getFirestoreDb} = require("../../../utils/firebase/firebase_ops");
const {hash, fail, scope} = require("../domain/news_article");
const {storyIdentity} = require("../../news_article_generator/domain/news_identity");
const millis = value => value?.toMillis?.() ?? new Date(value || 0).getTime();
class FirestoreNewsRepository {
  constructor({getDb = getFirestoreDb, now = () => new Date()} = {}) {this.getDb = getDb; this.now = now;}
  db() {return this.getDb();}
  async story(id) {return (await this.db().doc("newsStories/" + id).get()).data() || null;}
  async edition(id) {return (await this.db().doc("newsEditions/" + id).get()).data() || null;}
  async job(id) {return (await this.db().doc("newsGenerations/" + id).get()).data() || null;}
  identityStateRef() {return this.db().doc("newsStoryIdentities/_state");}
  async syncStoryIdentities() {
    // Include legacy/private previews without changing their IDs, publication
    // status, assignments or immutable editions. New candidates are not indexed
    // until their identity decision is committed with the worker lease.
    const db = this.db(), [pooled, previews, indexed] = await Promise.all([
      db.collection("newsStories").select("storyId", "canonicalTitle", "canonicalTitleLanguage", "sourceTitle", "facts", "publishedAt", "poolScope").get(),
      db.collection("newsGenerations").where("mode", "==", "preview").select("story").get(),
      db.collection("newsStoryIdentities").select("kind").get(),
    ]);
    const known = new Set(indexed.docs.map(doc => doc.id)), missing = new Map();
    for (const story of [...pooled.docs.map(doc => doc.data()), ...previews.docs.map(doc => doc.data().story)]) {
      const record = storyIdentity(story); if (record && !known.has(record.storyId)) missing.set(record.storyId, record);
    }
    const records = [...missing.values()];
    for (let offset = 0; offset < records.length; offset += 200) {
      const batch = records.slice(offset, offset + 200);
      await db.runTransaction(async tx => {
        const state = (await tx.get(this.identityStateRef())).data();
        const existing = await Promise.all(batch.map(record => tx.get(db.doc("newsStoryIdentities/" + record.storyId))));
        const fresh = batch.filter((_record, index) => !existing[index].exists); if (!fresh.length) return;
        for (const record of fresh) tx.create(db.doc("newsStoryIdentities/" + record.storyId), {...record, indexedAt: this.now()});
        tx.set(this.identityStateRef(), {revision: (state?.revision || 0) + 1, updatedAt: this.now()});
      });
    }
  }
  async storyIdentityCatalog() {
    return this.db().runTransaction(async tx => {
      const state = (await tx.get(this.identityStateRef())).data(), snapshot = await tx.get(this.db().collection("newsStoryIdentities"));
      return {revision: state?.revision || 0, items: snapshot.docs.map(doc => doc.data()).filter(record => record.kind === "storyIdentity").sort((a, b) => a.storyId.localeCompare(b.storyId))};
    });
  }
  async acceptStoryIdentity(job, story, expectedRevision, next) {
    const db = this.db(), ref = db.doc("newsGenerations/" + job.generationId), identityRef = db.doc("newsStoryIdentities/" + story.storyId);
    return db.runTransaction(async tx => {
      const current = (await tx.get(ref)).data(), state = (await tx.get(this.identityStateRef())).data(), existing = (await tx.get(identityRef)).data();
      if (current?.leaseToken !== job.leaseToken || current.status !== "running") throw fail("Generation ownership changed.", "generation-lease-lost");
      const revision = state?.revision || 0;
      if (revision !== expectedRevision) {
        tx.update(ref, {candidateStory: story, identityRevision: null, identityTitleCursor: 0, identityTitleScanComplete: false, identityCandidateIds: [], identityFactCursor: 0, identityUpdateOf: null,
          status: "queued", requestSequence: current.requestSequence + 1, leaseToken: null, leaseUntil: null, updatedAt: this.now()});
        return {stale: true};
      }
      if (existing) return {duplicate: true};
      tx.create(identityRef, {...storyIdentity(story), indexedAt: this.now()});
      tx.set(this.identityStateRef(), {revision: revision + 1, updatedAt: this.now()});
      tx.update(ref, {story, candidateStory: null, ...next, status: "queued", requestSequence: current.requestSequence + 1, leaseToken: null, leaseUntil: null, updatedAt: this.now()});
      return {accepted: true, storyId: story.storyId};
    });
  }
  questionsRef(setId) {return this.db().doc("newsQuestionSets/" + setId);}
  async questions(setId) {return (await this.questionsRef(setId).get()).data() || null;}
  questionLanguageRef(setId, languageId) {return this.questionsRef(setId).collection("languages").doc(languageId);}
  async questionLanguage(setId, languageId) {return (await this.questionLanguageRef(setId, languageId).get()).data() || null;}
  vocabularyRef(editionId, setId) {return this.db().doc(`newsEditions/${editionId}/vocabulary/${setId}`);}
  async vocabulary(editionId, setId) {return (await this.vocabularyRef(editionId, setId).get()).data() || null;}
  meaningRef(editionId, setId, meaningId) {return this.vocabularyRef(editionId, setId).collection("meanings").doc(meaningId);}
  async meaning(editionId, setId, meaningId) {return (await this.meaningRef(editionId, setId, meaningId).get()).data() || null;}
  async ensureVocabulary(data) {
    const ref = this.vocabularyRef(data.editionId, data.setId);
    return this.db().runTransaction(async tx => {const existing = (await tx.get(ref)).data(); if (existing) return existing;
      const saved = {...data, createdAt: this.now()}; tx.create(ref, saved); return saved;});
  }
  async indexedEdition(kind, value) {
    const pointer = (await this.db().doc("newsEditions/_keys/items/" + kind + "_" + value).get()).data();
    return pointer ? this.edition(pointer.editionId) : null;
  }
  async stories(newsType, country, {limit = 50, after = null} = {}) {
    let query = this.db().collection("newsStories").where("poolScope", "==", scope(newsType, country)).where("status", "==", "active").orderBy("publishedAt", "desc").orderBy("__name__").limit(limit);
    if (after) {const cursor = await this.db().doc("newsStories/" + after).get(); if (!cursor.exists) throw fail("Invalid story cursor."); query = query.startAfter(cursor);}
    return (await query.get()).docs.map(doc => doc.data());
  }
  async ensureJob(jobId, input) {
    const ref = this.db().doc("newsGenerations/" + jobId);
    return this.db().runTransaction(async tx => {
      const current = (await tx.get(ref)).data();
      if (current) return current;
      const job = {...input, generationId: jobId, editionId: randomUUID(), status: "queued", requestSequence: 1, createdAt: this.now(), updatedAt: this.now(), leaseToken: null, leaseUntil: null};
      tx.create(ref, job); return job;
    });
  }
  async claim(jobId, sequence) {
    const ref = this.db().doc("newsGenerations/" + jobId);
    return this.db().runTransaction(async tx => {
      const job = (await tx.get(ref)).data();
      if (!job || job.status !== "queued" || job.requestSequence !== sequence) return null;
      const leaseToken = randomUUID(), leaseUntil = new Date(this.now().getTime() + 600000);
      tx.update(ref, {status: "running", leaseToken, leaseUntil, updatedAt: this.now()});
      return {...job, leaseToken, leaseUntil};
    });
  }
  async checkpoint(job, changes, status = "queued", artifacts = []) {
    const ref = this.db().doc("newsGenerations/" + job.generationId);
    return this.db().runTransaction(async tx => {
      const current = (await tx.get(ref)).data();
      if (current?.leaseToken !== job.leaseToken || current.status !== "running") throw fail("Generation ownership changed.", "generation-lease-lost");
      for (const {ref, data} of artifacts) tx.set(ref, data);
      tx.update(ref, {...changes, status, leaseToken: null, leaseUntil: null, updatedAt: this.now(), ...(status === "queued" ? {requestSequence: current.requestSequence + 1} : {})});
    });
  }
  async retry(jobId) {
    const ref = this.db().doc("newsGenerations/" + jobId);
    return this.db().runTransaction(async tx => {
      const job = (await tx.get(ref)).data();
      if (!job) throw fail("Generation was not found.", "not-found");
      if (job.status !== "failed" && !(job.status === "running" && millis(job.leaseUntil) < this.now().getTime())) return job;
      const patch = {status: "queued", requestSequence: job.requestSequence + 1, leaseToken: null, leaseUntil: null, errorCode: null, errorMessage: null, errorDiagnostics: null, updatedAt: this.now()};
      tx.update(ref, patch); return {...job, ...patch};
    });
  }
  async publish(story, edition, {job = null, previewId = null} = {}) {
    const db = this.db(), storyRef = db.doc("newsStories/" + story.storyId), editionRef = edition ? db.doc("newsEditions/" + edition.editionId) : null;
    return db.runTransaction(async tx => {
      const existing = (await tx.get(storyRef)).data();
      const savedEdition = editionRef ? (await tx.get(editionRef)).data() : null;
      const jobRef = db.doc("newsGenerations/" + (job?.generationId || previewId));
      const currentJob = (await tx.get(jobRef)).data();
      if (job && (currentJob?.leaseToken !== job.leaseToken || currentJob.status !== "running")) throw fail("Generation ownership changed.", "generation-lease-lost");
      if (previewId && (currentJob?.status !== "completed" || currentJob.mode !== "preview")) throw fail("Finish preview generation first.", "failed-precondition");
      if (existing && (existing.factsHash !== story.factsHash || existing.poolScope !== story.poolScope)) throw fail("This story is already pooled with a different factual brief. Select the existing story for adaptation.", "already-exists");
      if (existing?.status === "retired" && previewId) throw fail("This story was removed from the pool.", "failed-precondition");
      if (!existing) tx.create(storyRef, {...story, createdAt: this.now()});
      if (edition && !savedEdition) {
        tx.create(editionRef, {...edition, createdAt: this.now(), status: "ready"});
        for (const image of edition.images) tx.set(storyRef.collection("media").doc(image.assetId), image);
        for (const [kind, value] of [["edition", edition.reuseKey], ["base", edition.baseKey]]) tx.set(db.doc("newsEditions/_keys/items/" + kind + "_" + value), {editionId: edition.editionId});
      }
      tx.update(jobRef, {status: "completed", resultStoryId: story.storyId, resultEditionId: edition?.editionId || null,
        ...(previewId ? {pooled: true, pooledAt: this.now()} : {leaseToken: null, leaseUntil: null}), updatedAt: this.now()});
      return {storyId: story.storyId, editionId: edition?.editionId || null};
    });
  }
  async sharedDiscovery(criteria, completedIds, input) {
    const db = this.db(), stateRef = db.doc("newsGenerations/_scopes/items/" + hash(scope(criteria.newsType, criteria.country)));
    return db.runTransaction(async tx => {
      const state = (await tx.get(stateRef)).data();
      if (state) {
        const current = (await tx.get(db.doc("newsGenerations/" + state.generationId))).data();
        const result = current?.resultStoryId ? (await tx.get(db.doc("newsStories/" + current.resultStoryId))).data() : null;
        if (current && (["queued", "running", "failed"].includes(current.status) || result?.status === "active" && !completedIds.has(result.storyId))) return current;
      }
      const generationId = randomUUID(), job = {...input, generationId, editionId: randomUUID(), status: "queued", requestSequence: 1, createdAt: this.now(), updatedAt: this.now(), leaseToken: null, leaseUntil: null};
      tx.create(db.doc("newsGenerations/" + generationId), job); tx.set(stateRef, {generationId}); return job;
    });
  }
  async retire(storyId, uid) {
    const ref = this.db().doc("newsStories/" + storyId);
    if (!(await ref.get()).exists) throw fail("Story was not found.", "not-found");
    await ref.update({status: "retired", retiredAt: this.now(), retiredBy: uid}); return {storyId, status: "retired"};
  }
}
module.exports = {FirestoreNewsRepository, millis};
