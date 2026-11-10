// Real shared component and feature facade, with deliberately slow/local/failing data providers.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const fromFunctions = require("node:module").createRequire(path.resolve(__dirname, "../functions/package.json"));
(async () => {
  const {default: puppeteer} = await import(fromFunctions.resolve("puppeteer"));
  const browser = await puppeteer.launch({executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium", headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"]});
  try {
    const page = await browser.newPage(), origin = "http://127.0.0.1:8793", root = path.resolve(__dirname, "../public"), errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.setRequestInterception(true);
    page.on("request", request => {
      const url = new URL(request.url());
      if (url.origin !== origin) return request.abort();
      if (url.pathname === "/__searchable_test") return request.respond({status: 200, contentType: "text/html", body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:Arial;padding:16px;margin:0}form{max-width:600px;margin:auto}</style><link rel="stylesheet" href="/utils/searchable_list/searchable_list.css"><form id="form"><div id="picker"></div><button type="submit">Save</button></form><div id="countries"></div>'});
      const file = path.resolve(root, "." + url.pathname);
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return request.abort();
      return request.respond({status: 200, contentType: file.endsWith(".css") ? "text/css" : "application/javascript", body: fs.readFileSync(file)});
    });
    await page.setViewport({width: 390, height: 844});
    await page.goto(origin + "/__searchable_test", {waitUntil: "networkidle0"});
    await page.evaluate(async () => {
      const {createSearchableList} = await import("/features/searchable_list/searchable_list_module.js");
      window.calls = []; window.selections = []; window.formSubmits = 0; window.retryCount = 0;
      document.querySelector("#form").addEventListener("submit", event => {event.preventDefault(); window.formSubmits++;});
      const dataset = Array.from({length: 23}, (_, index) => ({key: "product-" + index, title: "Alpha " + String(index).padStart(2, "0"), details: "Product detail"}));
      window.picker = createSearchableList({container: document.querySelector("#picker"), label: "Products", pageSize: 10, debounceMs: 200,
        getItemId: item => item.key, getItemLabel: item => item.title, getItemDescription: item => item.details || "",
        onSelect: item => window.selections.push(item?.key || null), loadItems: async ({query, filters, cursor, limit}) => {
          window.calls.push({query, filters, cursor, limit});
          if (query === "old") {await new Promise(resolve => setTimeout(resolve, 650)); return {items: [{key: "old", title: "OLD RESULT"}], nextCursor: null};}
          if (query === "new") return {items: [{key: "new", title: "NEW RESULT"}], nextCursor: null};
          if (query === "scope") {
            const category = filters.category || "red";
            if (category === "red") await new Promise(resolve => setTimeout(resolve, 650));
            return {items: [{key: category, title: category + " scope"}], nextCursor: null};
          }
          if (query === "error") {if (!window.retryCount++) throw new Error("Temporary search failure"); return {items: [{key: "retried", title: "Retry worked"}], nextCursor: null};}
          if (query === "scan") return cursor ? {items: [{key: "scan-match", title: "Match after an empty page"}], nextCursor: null} : {items: [], nextCursor: "continue"};
          if (query === "unsafe") return {items: [{key: "safe", title: "<img src=x onerror=alert(1)>"}], nextCursor: null};
          const matches = dataset.filter(item => item.title.toLowerCase().includes(query.toLowerCase())), start = Number(cursor || 0);
          return {items: matches.slice(start, start + limit), nextCursor: matches.length > start + limit ? String(start + limit) : null};
        }});
      window.countries = createSearchableList({container: document.querySelector("#countries"), label: "Countries",
        getItemId: item => item.code, getItemLabel: item => item.title,
        loadItems: ({query}) => ({items: [{code: "MY", title: "Malaysia"}, {code: "SG", title: "Singapore"}].filter(item => item.title.toLowerCase().includes(query.toLowerCase())), nextCursor: null})});
    });
    const input = "#picker input", options = "#picker [role=option]";
    const waitText = text => page.waitForFunction(expected => document.querySelector("#picker .searchable-list-status").textContent.includes(expected), {}, text);
    const query = value => page.$eval(input, (element, text) => {element.focus(); element.value = text; element.dispatchEvent(new Event("input", {bubbles: true}));}, value);
    await page.click(input); await waitText("10 suggestions");
    const before = await page.evaluate(() => calls.length);
    await page.type(input, "alp", {delay: 20}); await waitText("10 suggestions");
    assert.deepEqual(await page.evaluate(start => calls.slice(start).map(call => call.query), before), ["alp"]);
    await query("a"); await waitText("10 suggestions");
    assert.equal(await page.evaluate(() => calls.at(-1).query), "a");
    await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter");
    assert.equal(await page.evaluate(() => picker.getSelection().key), "product-0");
    assert.equal(await page.evaluate(() => formSubmits), 0);
    assert.equal(await page.$eval(input, node => node.getAttribute("aria-expanded")), "false");
    await page.click("#picker .searchable-list-clear"); await waitText("10 suggestions");
    assert.equal(await page.evaluate(() => picker.getSelection()), null);
    await page.click("#picker .searchable-list-more"); await waitText("20 suggestions");
    assert.equal((await page.$$(options)).length, 20);
    await page.click("#picker .searchable-list-more"); await waitText("23 suggestions");
    assert.equal(await page.$eval("#picker .searchable-list-more", node => node.hidden), true);

    await query("old"); await page.waitForFunction(() => calls.some(call => call.query === "old"));
    await query("new"); await waitText("1 suggestion");
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 700)));
    assert.match(await page.$eval("#picker [role=listbox]", node => node.textContent), /NEW RESULT/);
    assert.doesNotMatch(await page.$eval("#picker [role=listbox]", node => node.textContent), /OLD RESULT/);

    await query("scope"); await page.waitForFunction(() => calls.some(call => call.query === "scope"));
    await page.evaluate(() => picker.setFilters({category: "blue"})); await waitText("1 suggestion");
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 700)));
    assert.match(await page.$eval("#picker [role=listbox]", node => node.textContent), /blue scope/);
    await query("error"); await waitText("Temporary search failure");
    await page.click("#picker .searchable-list-retry"); await waitText("1 suggestion");
    assert.match(await page.$eval("#picker [role=listbox]", node => node.textContent), /Retry worked/);
    await query("none"); await waitText("No matches found");
    await query("scan"); await waitText("continue searching");
    assert.equal(await page.$eval("#picker .searchable-list-more", node => node.hidden), false);
    await page.click("#picker .searchable-list-more"); await waitText("1 suggestion");
    assert.match(await page.$eval("#picker [role=listbox]", node => node.textContent), /Match after an empty page/);
    await query("unsafe"); await waitText("1 suggestion");
    assert.equal(await page.$("#picker img"), null);
    assert.match(await page.$eval("#picker [role=listbox]", node => node.textContent), /<img/);
    await page.keyboard.press("Escape");
    assert.equal(await page.$eval(input, node => node.getAttribute("aria-expanded")), "false");

    const imeBefore = await page.evaluate(() => calls.length);
    await page.$eval(input, element => {element.dispatchEvent(new CompositionEvent("compositionstart")); element.value = "中文"; element.dispatchEvent(new Event("input", {bubbles: true}));});
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 250)));
    assert.equal(await page.evaluate(() => calls.length), imeBefore);
    await page.$eval(input, element => element.dispatchEvent(new CompositionEvent("compositionend")));
    await waitText("No matches found");
    assert.equal(await page.evaluate(() => calls.at(-1).query), "中文");
    const selectionEvents = await page.evaluate(() => selections.length);
    await page.evaluate(() => {picker.setSelection({key: "saved", title: "Existing value", details: "Saved item"}); picker.setDisabled(true);});
    assert.equal(await page.$eval(input, node => node.disabled), true);
    assert.equal(await page.evaluate(() => selections.length), selectionEvents);
    assert.equal(await page.evaluate(() => picker.getSelection().key), "saved");
    await page.evaluate(() => picker.setDisabled(false));
    await page.click("#countries input");
    await page.waitForFunction(() => document.querySelectorAll("#countries [role=option]").length === 2);
    await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter");
    assert.equal(await page.evaluate(() => countries.getSelection().code), "MY");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({path: "/tmp/rhx-searchable-list-mobile.png", fullPage: true});

    await page.evaluate(() => picker.setSelection(null)); await page.click(input);
    await query("old"); await page.waitForFunction(() => calls.filter(call => call.query === "old").length === 2);
    await page.evaluate(() => picker.destroy());
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 700)));
    assert.equal(await page.$eval("#picker", node => node.children.length), 0);
    assert.deepEqual(errors, []);
    console.log("PASS: generic remote/local providers, debounce and first-character search, pagination, keyboard selection without form submission, stale responses and filters, retry, empty continuations, safe text, IME input, preselection, disabling, mobile layout, and cleanup during a request.");
  } finally {await browser.close();}
})().catch(error => {console.error(error); process.exitCode = 1;});
