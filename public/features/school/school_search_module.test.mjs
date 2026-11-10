import {test} from "node:test";
import assert from "node:assert/strict";
import {createSchoolSearchProvider} from "./school_search_module.js";

test("school autocomplete adapts generic queries, optional filters and pagination without storing selections", async () => {
  const calls = [], page = {items: [{id: "school", name: "SJKC Chung Hua", stateName: "Selangor", localityName: "Petaling Jaya"}], nextCursor: "next"};
  const loadItems = createSchoolSearchProvider({api: {listSchools: async input => {calls.push(input); return page;}}});
  assert.deepEqual(await loadItems({query: "c", filters: {}}), {items: [], nextCursor: null});
  assert.equal(calls.length, 0);
  assert.equal(await loadItems({query: "c", filters: {country: "Malaysia", level: "primary"}}), page);
  assert.deepEqual(calls[0], {country: "Malaysia", level: "primary", search: "c", searchMode: "wordPrefix", limit: 10});
  await loadItems({query: "Chung H", filters: {country: "Malaysia", level: "primary", stateId: "state", localityId: "town"}, cursor: "previous", limit: 20});
  assert.deepEqual(calls[1], {country: "Malaysia", level: "primary", search: "Chung H", searchMode: "wordPrefix", limit: 20, stateId: "state", localityId: "town", cursor: "previous"});
  for (const status of ["active", "archived", "all"]) {
    await loadItems({query: "c", filters: {country: "Malaysia", level: "primary", status}});
    assert.equal(calls.at(-1).status, status, "Administrators' status filters reach the backend authorizer");
  }
});
test("school autocomplete discards superseded requests before and after the callable response", async () => {
  const controller = new AbortController(); let calls = 0;
  const loadItems = createSchoolSearchProvider({api: {listSchools: async () => {calls++; controller.abort(); return {items: [], nextCursor: null};}}});
  await assert.rejects(loadItems({query: "a", filters: {country: "Malaysia", level: "primary"}, signal: controller.signal}), {name: "AbortError"});
  await assert.rejects(loadItems({query: "b", filters: {country: "Malaysia", level: "primary"}, signal: controller.signal}), {name: "AbortError"});
  assert.equal(calls, 1);
});
