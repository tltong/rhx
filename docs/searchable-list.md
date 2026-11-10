# Shared searchable list

The generic autocomplete lives in `public/utils/searchable_list/`. Pages import
its public factory from `public/features/searchable_list/searchable_list_module.js`.
The utility has no Firebase, school, location, or persistence dependency. It works
with synchronous local providers and asynchronous paginated APIs.

Load the shared CSS in the host page:

```html
<link rel="stylesheet" href="/utils/searchable_list/searchable_list.css">
<div id="picker"></div>
```

```js
import {createSearchableList}
  from "/features/searchable_list/searchable_list_module.js";

const picker = createSearchableList({
  container: document.querySelector("#picker"),
  label: "Products",
  loadItems: async ({query, filters, cursor, limit, signal}) => {
    return productApi.search({query, filters, cursor, limit, signal});
  },
  getItemId: item => item.id,
  getItemLabel: item => item.name,
  getItemDescription: item => item.category,
  onSelect: item => {selectedProduct = item;},
  filters: {},
  debounceMs: 200,
  pageSize: 10,
});
```

Providers return `{items, nextCursor}`. The default ID and label accessors use
`item.id` and `item.name`. Descriptions are optional. To use a small local list,
provide a function that filters the array and returns the requested slice and
its continuation cursor. No backend collection is required by the component.

## Controller API

| Method | Behavior |
| --- | --- |
| `setFilters(filters)` | Replaces the filter object, invalidates outstanding results, and restarts an open search. |
| `setSelection(itemOrNull)` | Preselects an item or clears it without invoking `onSelect`. |
| `getSelection()` | Returns the selected item or `null`. |
| `getQuery()` | Returns the displayed search text. |
| `refresh()` | Reloads the current query immediately. |
| `setDisabled(boolean)` | Disables interaction and cancels pending display updates. |
| `destroy()` | Removes the control, listeners, timers, and pending display updates. |

Typing clears an existing selection and calls `onSelect(null)`. Only choosing a
suggestion calls `onSelect(item)`. These callbacks update the caller's state;
the control never writes a selected record to a backend itself. Callers own
business rules such as clearing a dependent city field after a state change.

## Interaction and request handling

Focus opens suggestions. Each input change invalidates old results immediately
and requests the latest text after a 200 ms pause by default. The control shows
ten suggestions per page and exposes **Load more results** for additional pages.
It does not automatically download an entire list.

Each request receives an `AbortSignal` for providers that support cancellation.
Every response is also checked against its query generation, so stale success or
error responses cannot replace newer text or filter results. Firebase callable
requests cannot be physically aborted by this signal; their late responses are
still discarded.

Arrow keys move through suggestions; Enter selects without submitting a parent
form. Escape closes the suggestions, and Tab moves onward. Touch/click selects a
result. Combobox/listbox roles, active-descendant tracking, labels, and live status
messages support assistive technology. IME composition waits until text is
committed before searching. Loading, no-match, retry, and empty continuation-page
states are handled inside the utility. Item text is rendered through text nodes.

## School provider and guardian integration

`createSchoolSearchProvider` in `public/features/school/school_search_module.js`
adapts `listSchools` to the provider contract. It requires country and level and
passes optional state, city/town, stream, and status filters. The backend enforces
administrator permission for Archived/All status. It uses `wordPrefix` mode,
which supports one-character input and multiple word prefixes. The school API
returns response-only `stateName` and `localityName` labels for disambiguation.

The guardian linked-student editor uses this shared feature. It requests ten
school suggestions at a time, shows town/state names, and leaves location filters
optional. Changing or clearing state clears city/town. Country/level changes clear
an incompatible selection. A failed city lookup cannot retain an old state filter.
Choosing a suggestion updates the pending school ID; **Save details** applies the
existing backend school/stream alignment transaction.

The school/location admin uses the same control and provider for its directory.
Country and level define the scope; state and city/town remain optional. Its
Active, Archived, and All choices are forwarded as the API status filter. It
loads ten suggestions at a time, with **Load more results** for subsequent pages.
Selecting a result fetches its current record/version before filling the editor;
it does not save. Failed record or city lookups preserve unsaved editor input and
apply the latest search filters. School, location, and archive mutations refresh
the search without requiring a manual search button.

## Verification and release

```sh
node --test --test-isolation=none public/features/school/school_search_module.test.mjs \
  functions/features/school/school_feature.test.js
node scripts/test-searchable-list-browser.cjs

FIRESTORE_EMULATOR_HOST=127.0.0.1:8785 GCLOUD_PROJECT=demo-rhx-school-search \
  node --test functions/school_catalog_emulator.test.js \
    scripts/backfill-school-search-prefixes.test.cjs scripts/import-malaysia-primary-schools.test.cjs

FIRESTORE_EMULATOR_HOST=127.0.0.1:8785 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
  GCLOUD_PROJECT=demo-rhx-student-profile node scripts/test-guardian-student-edit-browser.cjs
```

Release the updated `schoolCatalog` writer first, rerun the prefix backfill to
add one-character prefixes to existing records, then publish Hosting. Existing
word-prefix composite indexes are reused; no new collection or index definition
is needed. See [school-directory.md](school-directory.md) for the maintenance
command and field-preservation guarantees.
