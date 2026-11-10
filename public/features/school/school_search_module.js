import * as schoolApi from "./school_module.js?v=20261110-autocomplete-v1";

/** Adapt the school directory to the generic searchable-list provider contract. */
export function createSchoolSearchProvider({api = schoolApi} = {}) {
  return async ({query = "", filters = {}, cursor = null, limit = 10, signal} = {}) => {
    const check = () => {if (signal?.aborted) throw new DOMException("Search was superseded.", "AbortError");};
    check();
    if (!filters.country || !filters.level) return {items: [], nextCursor: null};
    const input = {country: filters.country, level: filters.level, search: query, searchMode: "wordPrefix", limit};
    for (const field of ["stateId", "localityId", "streamId", "status"]) if (filters[field]) input[field] = filters[field];
    if (cursor != null) input.cursor = cursor;
    const page = await api.listSchools(input);
    check();
    return page;
  };
}
