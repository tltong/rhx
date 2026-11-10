/** Generic autocomplete. Data providers return {items, nextCursor}; no feature or backend dependencies. */
export function createSearchableList({container, loadItems, getItemId = item => item.id,
  getItemLabel = item => item.name, getItemDescription = () => "", onSelect = () => {}, filters: initialFilters = {},
  label = "Search", placeholder = "Start typing…", debounceMs = 200, pageSize = 10}) {
  if (!container?.append || typeof loadItems !== "function") throw new TypeError("A container and data provider are required.");
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100 || !Number.isFinite(debounceMs) || debounceMs < 0) throw new TypeError("Invalid search timing or page size.");
  const doc = container.ownerDocument, id = "searchable-list-" + crypto.randomUUID();
  const create = (tag, className) => {const element = doc.createElement(tag); if (className) element.className = className; return element;};
  const root = create("div", "searchable-list"), labelEl = create("label"), field = create("div", "searchable-list-field");
  const input = create("input", "searchable-list-input"), clear = create("button", "searchable-list-clear");
  const panel = create("div", "searchable-list-panel"), list = create("ul", "searchable-list-options");
  const more = create("button", "searchable-list-more"), retry = create("button", "searchable-list-retry");
  const status = create("p", "searchable-list-status"), description = create("p", "searchable-list-selection");
  labelEl.htmlFor = id; labelEl.textContent = label;
  input.id = id; input.type = "search"; input.autocomplete = "off"; input.spellcheck = false; input.maxLength = 200; input.placeholder = placeholder;
  input.setAttribute("role", "combobox"); input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-controls", id + "-options"); input.setAttribute("aria-expanded", "false");
  input.setAttribute("aria-describedby", id + "-status " + id + "-selection");
  clear.type = more.type = retry.type = "button";
  clear.textContent = "×"; clear.setAttribute("aria-label", "Clear " + label.toLowerCase());
  list.id = id + "-options"; list.setAttribute("role", "listbox"); list.setAttribute("aria-label", label + " suggestions");
  more.textContent = "Load more results"; retry.textContent = "Retry search";
  status.id = id + "-status"; status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
  description.id = id + "-selection";
  field.append(input, clear); panel.append(list, more, retry); root.append(labelEl, field, description, panel, status); container.append(root);
  let filters = {...initialFilters}, selected = null, items = [], cursor = null, active = -1;
  let epoch = 0, timer, controller, loading = false, opened = false, disabled = false, destroyed = false;
  let composing = false, suppressFocus = false, failed = false, failedAppend = false;
  const cleanups = [];
  function listen(target, event, callback) {target.addEventListener(event, callback); cleanups.push(() => target.removeEventListener(event, callback));}
  function say(message, error = false) {status.textContent = message; status.classList.toggle("is-error", error);}
  function controls() {
    input.disabled = clear.disabled = disabled;
    clear.hidden = !input.value && !selected;
    more.hidden = cursor == null; more.disabled = loading || disabled;
    more.textContent = items.length ? "Load more results" : "Continue searching";
    retry.hidden = !failed; retry.disabled = loading || disabled;
    panel.hidden = !opened || disabled;
    input.setAttribute("aria-expanded", String(opened && !disabled));
    list.setAttribute("aria-busy", String(loading));
    description.textContent = selected ? String(getItemDescription(selected) || "") : "";
    description.hidden = !description.textContent;
  }
  function cancel() {epoch++; clearTimeout(timer); timer = null; controller?.abort(); controller = null; loading = false;}
  function close() {opened = false; active = -1; input.removeAttribute("aria-activedescendant"); if (!items.length && !failed) say(""); controls();}
  function resetResults() {items = []; cursor = null; active = -1; list.replaceChildren(); input.removeAttribute("aria-activedescendant");}
  function choose(item) {
    cancel(); selected = item; input.value = String(getItemLabel(item)); failed = false; close(); say("");
    suppressFocus = true; input.focus({preventScroll: true}); suppressFocus = false;
    onSelect(item);
  }
  function render() {
    list.replaceChildren(); active = -1; input.removeAttribute("aria-activedescendant");
    for (let index = 0; index < items.length; index++) {
      const item = items[index], option = create("li", "searchable-list-option");
      option.id = id + "-option-" + index; option.dataset.itemId = String(getItemId(item));
      option.setAttribute("role", "option"); option.setAttribute("aria-selected", "false"); option.tabIndex = -1;
      const title = create("span", "searchable-list-title"); title.textContent = String(getItemLabel(item)); option.append(title);
      const details = String(getItemDescription(item) || "");
      if (details) {const subtitle = create("span", "searchable-list-description"); subtitle.textContent = details; option.append(subtitle);}
      option.addEventListener("mousedown", event => event.preventDefault());
      option.addEventListener("click", () => {if (!disabled && !loading && opened) choose(item);});
      list.append(option);
    }
    controls();
  }
  async function execute(append, ticket) {
    if (destroyed || disabled || ticket !== epoch) return;
    const previousCursor = append ? cursor : null;
    controller = new AbortController();
    try {
      const page = await loadItems({query: input.value, filters: {...filters}, cursor: previousCursor, limit: pageSize, signal: controller.signal});
      if (destroyed || disabled || ticket !== epoch) return;
      if (!page || !Array.isArray(page.items) || page.items.length > pageSize) throw new Error("The search service returned an invalid page.");
      if (append && previousCursor != null && page.nextCursor === previousCursor) throw new Error("Search could not advance. Retry the search.");
      const combined = append ? [...items, ...page.items] : page.items, unique = new Map();
      for (const item of combined) {
        const key = getItemId(item);
        if (key === undefined || key === null || key === "") throw new Error("A search result is missing its identifier.");
        unique.set(String(key), item);
      }
      items = [...unique.values()]; cursor = page.nextCursor ?? null; failed = false;
      render();
      say(items.length ? `${items.length} suggestion${items.length === 1 ? "" : "s"}.${cursor != null ? " More results are available." : ""}`
        : cursor != null ? "Keep typing to narrow your search, or continue searching." : "No matches found.");
    } catch (error) {
      if (destroyed || disabled || ticket !== epoch) return;
      failed = true; failedAppend = append;
      say(error.message || "Could not load results. Try again.", true);
    } finally {
      if (!destroyed && ticket === epoch) {loading = false; controller = null; controls();}
    }
  }
  function begin(append = false, delay = 0) {
    if (destroyed || disabled) return Promise.resolve();
    cancel(); if (!append) resetResults();
    opened = true; loading = true; failed = false; say("Searching…"); controls();
    const ticket = epoch;
    if (delay) {timer = setTimeout(() => {timer = null; void execute(append, ticket);}, delay); return Promise.resolve();}
    return execute(append, ticket);
  }
  function changed() {
    if (selected) {selected = null; onSelect(null);}
    if (composing) {cancel(); resetResults(); close(); say(""); return;}
    void begin(false, debounceMs);
  }
  function activate(index) {
    active = index;
    Array.from(list.children).forEach((option, position) => option.setAttribute("aria-selected", String(position === active)));
    const option = list.children[active];
    if (option) {input.setAttribute("aria-activedescendant", option.id); option.scrollIntoView({block: "nearest"});}
  }
  listen(input, "input", changed);
  listen(input, "compositionstart", () => {composing = true; cancel(); resetResults(); close();});
  listen(input, "compositionend", () => {composing = false; changed();});
  listen(input, "focus", () => {if (!suppressFocus) void begin();});
  listen(input, "keydown", event => {
    if (composing || event.isComposing) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!opened) {void begin(); return;}
      if (!loading && items.length) activate(event.key === "ArrowDown" ? (active + 1) % items.length : active <= 0 ? items.length - 1 : active - 1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (!loading && opened && items.length) choose(items[active >= 0 ? active : 0]);
      else if (!loading) void begin();
    } else if (event.key === "Escape" && opened) {
      event.preventDefault(); event.stopPropagation(); cancel(); close();
    } else if (event.key === "Tab") {cancel(); close();}
  });
  listen(clear, "click", () => {
    cancel(); selected = null; input.value = ""; resetResults(); onSelect(null);
    suppressFocus = true; input.focus(); suppressFocus = false; void begin();
  });
  listen(more, "click", () => {if (!loading && cursor != null) void begin(true);});
  listen(retry, "click", () => {if (!loading) void begin(failedAppend);});
  listen(doc, "pointerdown", event => {if (!root.contains(event.target)) {cancel(); close();}});
  listen(root, "focusout", event => {if (event.relatedTarget && !root.contains(event.relatedTarget)) {cancel(); close();}});
  controls();
  return {
    setFilters(next) {if (destroyed) return; filters = {...next}; const wasOpen = opened; cancel(); resetResults(); failed = false; say(""); controls(); if (wasOpen && !disabled) void begin();},
    setSelection(item) {if (destroyed) return; cancel(); selected = item ?? null; input.value = selected ? String(getItemLabel(selected)) : ""; resetResults(); failed = false; close(); say("");},
    getSelection() {return selected;},
    getQuery() {return input.value;},
    refresh() {return begin();},
    setDisabled(value) {if (destroyed) return; disabled = !!value; if (disabled) {cancel(); close();} controls();},
    destroy() {if (destroyed) return; cancel(); destroyed = true; cleanups.forEach(cleanup => cleanup()); root.remove();},
  };
}
