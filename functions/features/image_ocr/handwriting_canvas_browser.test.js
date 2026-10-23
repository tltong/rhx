const assert = require("node:assert/strict");
const {before, after, test} = require("node:test");
const http = require("node:http");
const fs = require("node:fs/promises");
const {existsSync} = require("node:fs");
const path = require("node:path");
const {createImageOcrFeature} = require("./image_ocr_module");
const {createImageOcrHandler} = require("../../image_ocr_http");
const {OpenAIUtil} = require("../../utils/llm/openai_util");
const {DeepseekUtil} = require("../../utils/llm/deepseek_util");
const {registerLlmProvider} = require("../../utils/llm/llm_util");
const {PaddleOcrUtil} = require("../../utils/llm/paddleocr");

const publicRoot = path.resolve(__dirname, "../../../public");
let server, browser, origin;
const integration = {configuration: null, saves: 0, requests: [], providerCalls: []};
before(async () => {
  const transcription = {text: "Hello studant\n學生的原文", warnings: ["Mock OCR result for browser testing."]};
  registerLlmProvider("openai", new OpenAIUtil({createClient: () => ({responses: {create: async input => {
    integration.providerCalls.push({provider: "openai", input});
    return {status: "completed", output: [{type: "message", role: "assistant", status: "completed", content: [{type: "output_text", text: JSON.stringify(transcription)}]}]};
  }}})}));
  registerLlmProvider("deepseek", new DeepseekUtil({createOcrClient: () => ({chat: {completions: {create: async input => {
    integration.providerCalls.push({provider: "deepseek", input});
    return {choices: [{finish_reason: "stop", message: {content: JSON.stringify(transcription)}}]};
  }}}})}));
  registerLlmProvider("paddleocr", new PaddleOcrUtil({getEndpoint: () => "https://paddleocr-test-uc.a.run.app", createClient: async () => ({
    getRequestHeaders: async () => ({Authorization: "Bearer test-service-identity"}), transporter: {request: async options => {
      assert.equal(options.retry, false); assert.equal(options.headers.Authorization, "Bearer test-service-identity");
      integration.providerCalls.push({provider: "paddleocr", input: options.data});
      return {data: {...transcription, provider: "paddleocr", model: "PP-OCRv6_medium"}};
    }},
  })}));
  const feature = createImageOcrFeature({repository: {getConfig: async () => integration.configuration, saveConfig: async (settings, uid) => {
    integration.saves++; return integration.configuration = {...settings, updatedBy: uid};
  }}, getUser: async uid => ({uid, email: "admin@example.com", emailVerified: true}), checkAdmin: async () => true});
  const handler = createImageOcrHandler({apis: feature, verifyToken: async token => {
    assert.equal(token, "browser-test-token"); return {uid: "admin"};
  }, log: {info() {}, error() {}}});
  server = http.createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url, "http://localhost").pathname;
      if (pathname === "/mock-ocr-api") {
        let raw = ""; for await (const chunk of request) raw += chunk;
        const body = JSON.parse(raw); integration.requests.push(body);
        const wrapped = {set(name, value) {response.setHeader(name, value);}, status(code) {response.statusCode = code; return this;},
          json(value) {response.setHeader("Content-Type", "application/json"); response.end(JSON.stringify(value));}, send(value) {response.end(value);}};
        await handler({method: request.method, headers: request.headers, body}, wrapped); return;
      }
      const file = path.resolve(publicRoot, "." + pathname);
      if (!file.startsWith(publicRoot + path.sep)) {response.writeHead(404).end(); return;}
      let contents = await fs.readFile(file);
      if (pathname.endsWith(".html")) {
        // Mount the real page with fake APIs; no Firebase login or paid OCR calls.
        contents = Buffer.from(contents.toString().replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "")
          .replace('id="image-ocr-admin"', 'id="image-ocr-browser-test"'));
      }
      response.setHeader("Content-Type", pathname.endsWith(".js") ? "text/javascript" : pathname.endsWith(".css") ? "text/css" : "text/html");
      response.end(contents);
    } catch {response.writeHead(404).end();}
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  const {default: puppeteer} = await import("puppeteer");
  browser = await puppeteer.launch({headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
    args: ["--no-sandbox", "--disable-dev-shm-usage"]});
});
after(async () => {await browser?.close(); if (server) await new Promise(resolve => server.close(resolve));});

async function openPage(width, textScale = 1, fullFlow = false) {
  const page = await browser.newPage();
  await page.setViewport({width, height: 900});
  await page.goto(`${origin}/features/image_ocr/pages/admin/image_ocr_admin.html`);
  await page.evaluate(async ({textScale, fullFlow}) => {
    if (textScale !== 1) document.documentElement.style.fontSize = `${16 * textScale}px`;
    const {mountImageOcrAdmin} = await import("/features/image_ocr/pages/admin/image_ocr_admin.js?stroke-layout-test");
    window.ocrRequests = [];
    let controller;
    if (fullFlow) {
      const version = "?v=20261023-ocr-language-v1";
      const {ImageOcrClient} = await import("/utils/llm/image_ocr_client.js?v=20261021-ocr-canvas-v1");
      const {createImageOcrFeature} = await import("/features/image_ocr/image_ocr_module.js" + version);
      const user = {uid: "admin", getIdToken: async () => "browser-test-token"};
      const client = new ImageOcrClient({endpointUrl: "/mock-ocr-api", getUser: () => user});
      const feature = createImageOcrFeature({client, getUser: () => user});
      window.ocrFeature = feature;
      controller = mountImageOcrAdmin({listLanguages: async () => ["English", "Chinese", "Malay"], getConfig: feature.getImageOcrConfig, saveConfig: feature.saveImageOcrConfig, testOcr: feature.testImageOcr});
    } else controller = mountImageOcrAdmin({listLanguages: async () => ["English", "Chinese", "Malay"], getConfig: async () => null, testOcr: async input => {
      window.ocrRequests.push(input);
      return {text: "Test transcription", warnings: [], provider: input.configuration.provider, model: input.configuration.model};
    }});
    await controller.ready;
    const language = document.getElementById("ocr-test-language"); language.value = "English"; language.dispatchEvent(new Event("change"));
    const context = document.getElementById("ocr-canvas").getContext("2d");
    window.paintPoints = [];
    for (const name of ["arc", "lineTo"]) {
      const original = context[name].bind(context);
      context[name] = (...args) => {window.paintPoints.push({name, x: args[0], y: args[1]}); return original(...args);};
    }
  }, {textScale, fullFlow});
  return page;
}
async function canvasBox(page) {
  return page.$eval("#ocr-canvas", canvas => {
    const box = canvas.getBoundingClientRect();
    return {x: box.x, y: box.y, width: box.width, height: box.height, top: box.top + scrollY};
  });
}
function assertStationary(before, after, message) {
  assert.ok(Math.abs(after.top - before.top) < 0.1, `${message}: canvas shifted ${after.top - before.top}px`);
  assert.equal(after.width, before.width); assert.equal(after.height, before.height);
}
async function assertHorizontalStroke(page, start) {
  const points = await page.evaluate(() => window.paintPoints);
  assert.ok(points.some(point => point.name === "lineTo"));
  const expectedY = 80 * 1600 / start.height;
  for (const point of points) assert.ok(Math.abs(point.y - expectedY) < 0.1, `Unexpected start tick: ${point.y} differs from ${expectedY}`);
}

test("starting and clearing a stroke never moves the canvas or adds a tick across screen sizes", async () => {
  for (const width of [320, 360, 390, 450, 480, 768, 850, 900, 1360]) {
    const page = await openPage(width);
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        await page.$eval("#ocr-canvas", canvas => canvas.scrollIntoView({block: "center"}));
        const start = await canvasBox(page);
        await page.evaluate(() => {window.paintPoints = [];});
        await page.mouse.move(start.x + 50, start.y + 80); await page.mouse.down();
        assertStationary(start, await canvasBox(page), `Width ${width}, stroke ${attempt + 1}`);
        await page.mouse.move(start.x + 150, start.y + 80, {steps: 5}); await page.mouse.up();
        await assertHorizontalStroke(page, start);
        const beforeClear = await canvasBox(page);
        // Preserve scroll position while exercising the actual Clear handler.
        await page.$eval("#ocr-clear", button => button.click());
        assertStationary(beforeClear, await canvasBox(page), `Width ${width}, clear`);
      }
    } finally {await page.close();}
  }
});

test("touch handwriting starts without a jump on a phone with normal and enlarged text", async () => {
  for (const textScale of [1, 1.25, 2]) {
    const page = await openPage(390, textScale);
    try {
      await page.$eval("#ocr-canvas", canvas => canvas.scrollIntoView({block: "center"}));
      const start = await canvasBox(page), cdp = await page.createCDPSession();
      await cdp.send("Emulation.setTouchEmulationEnabled", {enabled: true, maxTouchPoints: 1});
      const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent", {type,
        touchPoints: type === "touchEnd" ? [] : [{x, y, id: 1, radiusX: 1, radiusY: 1, force: 1}]});
      await touch("touchStart", start.x + 50, start.y + 80);
      assertStationary(start, await canvasBox(page), `Touch with text scale ${textScale}`);
      await touch("touchMove", start.x + 100, start.y + 80); await touch("touchEnd");
      await assertHorizontalStroke(page, start);
      assert.equal(await page.$eval("#ocr-extract", button => button.disabled), false);
    } finally {await page.close();}
  }
});

async function assertPngPreservesInk(page, requestIndex) {
  const image = await page.evaluate(async requestIndex => {
    const canvas = document.getElementById("ocr-canvas"), request = window.ocrRequests[requestIndex];
    const before = canvas.toDataURL(), bitmap = await createImageBitmap(request.image);
    const exported = document.createElement("canvas"); exported.width = bitmap.width; exported.height = bitmap.height;
    const context = exported.getContext("2d"); context.drawImage(bitmap, 0, 0); bitmap.close();
    function inspect(paper) {
      const pixels = paper.getContext("2d").getImageData(0, 0, paper.width, paper.height).data;
      let left = paper.width, top = paper.height, right = -1, bottom = -1, count = 0, opaque = true;
      for (let y = 0; y < paper.height; y++) for (let x = 0; x < paper.width; x++) {
        const i = (y * paper.width + x) * 4;
        if (pixels[i + 3] !== 255) opaque = false;
        if (pixels[i] === 255 && pixels[i + 1] === 255 && pixels[i + 2] === 255) continue;
        count++; left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
      }
      return {pixels, left, top, right, bottom, count, opaque};
    }
    const source = inspect(canvas), output = inspect(exported);
    let equalPixels = true;
    for (let y = source.top; y <= source.bottom; y++) for (let x = source.left; x <= source.right; x++) {
      const i = (y * canvas.width + x) * 4;
      const j = ((y - source.top + output.top) * exported.width + x - source.left + output.left) * 4;
      for (let channel = 0; channel < 4; channel++) if (source.pixels[i + channel] !== output.pixels[j + channel]) equalPixels = false;
    }
    return {type: request.image.type, width: exported.width, height: exported.height, sourceInk: source.count, outputInk: output.count,
      opaque: output.opaque, equalPixels, unchanged: before === canvas.toDataURL(),
      margins: [output.left, output.top, exported.width - output.right - 1, exported.height - output.bottom - 1]};
  }, requestIndex);
  assert.equal(image.type, "image/png"); assert.ok(image.sourceInk > 0);
  assert.equal(image.outputInk, image.sourceInk, "Export must keep every ink pixel");
  assert.equal(image.equalPixels, true, "Cropping must preserve colours, shapes, spacing and thickness without resampling");
  assert.equal(image.opaque, true); assert.equal(image.unchanged, true);
  for (const margin of image.margins) assert.ok(margin >= 24 && margin <= 26, `Expected a small white margin, got ${margin}px`);
  return image;
}
async function testOcr(page, requestCount) {
  assert.equal(await page.$eval("#ocr-extract", button => button.disabled), false, "A completed stroke is required before testing OCR");
  await page.$eval("#ocr-extract", button => button.click());
  await page.waitForFunction(count => window.ocrRequests.length === count && !document.getElementById("ocr-result").hidden, {timeout: 5000}, requestCount);
  return assertPngPreservesInk(page, requestCount - 1);
}

test("OCR receives a cropped lossless PNG with distinct pen thicknesses and the same preview", async () => {
  const page = await openPage(1360);
  try {
    assert.equal(await page.$eval("#ocr-pen-width", select => select.value), "3");
    await page.$eval("#ocr-canvas", canvas => canvas.scrollIntoView({block: "center"}));
    const start = await canvasBox(page);
    for (const [width, y] of [["2", 80], ["5", 160]]) {
      await page.select("#ocr-pen-width", width);
      await page.mouse.move(start.x + 50, start.y + y); await page.mouse.down();
      assert.equal(await page.$eval("#ocr-pen-width", select => select.disabled), true);
      await page.mouse.move(start.x + 150, start.y + y, {steps: 5}); await page.mouse.up();
      assert.equal(await page.$eval("#ocr-pen-width", select => select.disabled), false);
    }
    const heights = await page.$eval("#ocr-canvas", canvas => {
      const scale = canvas.width / canvas.getBoundingClientRect().width, context = canvas.getContext("2d");
      return [80, 160].map(y => {
        const data = context.getImageData(Math.round(100 * scale), Math.round((y - 10) * scale), 1, Math.round(20 * scale)).data;
        let ink = 0; for (let i = 0; i < data.length; i += 4) if (data[i] < 255) ink++;
        return ink;
      });
    });
    assert.ok(heights[1] > heights[0] * 1.8, `Thick and thin strokes must differ: ${heights}`);
    const image = await testOcr(page, 1); assert.ok(image.width < 600 && image.height < 600);
    await page.waitForFunction(() => document.getElementById("ocr-sent-image").naturalWidth > 0);
    assert.equal(await page.$eval("#ocr-sent-image", img => img.naturalWidth), image.width);
    assert.equal(await page.evaluate(() => document.getElementById("ocr-sent-image").src === document.getElementById("ocr-download").href), true);
    assert.equal(await page.$eval("#ocr-draft-status", element => element.textContent), "Current default settings");
    await page.$eval("#ocr-undo", button => button.click());
    const afterUndo = await testOcr(page, 2); assert.ok(afterUndo.height < image.height);
    assert.equal(await page.$eval("#ocr-pen-width", select => select.value), "5");
  } finally {await page.close();}
});

test("cropping preserves single dots and ink at every canvas edge, and Undo and Clear update exports", async () => {
  const page = await openPage(390);
  try {
    await page.select("#ocr-pen-width", "5");
    await page.$eval("#ocr-canvas", canvas => canvas.scrollIntoView({block: "center"}));
    const box = await canvasBox(page);
    // Use edge centres: the canvas's rounded CSS corners are outside its hit area.
    const edges = [[0.5, box.height / 2], [box.width / 2, 0.5], [box.width - 0.5, box.height / 2], [box.width / 2, box.height - 0.5]];
    for (const [index, [x, y]] of edges.entries()) {
      await page.mouse.click(box.x + x, box.y + y);
      const image = await testOcr(page, index + 1);
      assert.ok(image.outputInk > 0);
      // Reset after each edge so each tiny dot must produce its own crop.
      assert.ok(image.width < 100 && image.height < 100);
      await page.$eval("#ocr-clear", button => button.click());
      assert.equal(await page.$eval("#ocr-extract", button => button.disabled), true);
    }
    for (const [x, y] of edges) await page.mouse.click(box.x + x, box.y + y);
    const full = await testOcr(page, 5); assert.equal(full.width, 1248); assert.equal(full.height, 1648);
    await page.$eval("#ocr-undo", button => button.click());
    await testOcr(page, 6); // Remaining edge strokes retain their pixels and margins.
    await page.$eval("#ocr-clear", button => button.click());
    assert.equal(await page.$eval("#ocr-result", result => result.hidden), true);
    assert.equal(await page.$eval("#ocr-extract", button => button.disabled), true);
  } finally {await page.close();}
});

test("language provider drafts and saved routing reach all three adapters through the real web-to-backend flow", async () => {
  let page = await openPage(1360, 1, true);
  try {
    assert.equal(await page.$eval("#ocr-provider", input => input.value), "openai");
    assert.equal(await page.$eval("#ocr-provider", input => input.disabled), true);
    await page.select("#ocr-model", "gpt-6-astra");
    await page.select('[data-language="english"]', "paddleocr");
    assert.match(await page.$eval("#ocr-test-provider", element => element.textContent), /PaddleOCR/);
    await page.$eval("#ocr-canvas", canvas => canvas.scrollIntoView({block: "center"}));
    const box = await canvasBox(page);
    await page.mouse.move(box.x + 50, box.y + 80); await page.mouse.down();
    await page.mouse.move(box.x + 150, box.y + 120, {steps: 5}); await page.mouse.up();
    await page.$eval("#ocr-extract", button => button.click());
    await page.waitForFunction(() => !document.getElementById("ocr-result").hidden, {timeout: 5000});
    assert.equal(integration.saves, 0); assert.equal(integration.configuration, null);
    assert.equal(integration.providerCalls.length, 1); assert.equal(integration.providerCalls[0].provider, "paddleocr");
    assert.equal(integration.providerCalls[0].input.model, "PP-OCRv6_medium");
    assert.match(await page.$eval("#ocr-result-model", element => element.textContent), /PaddleOCR/);
    await page.$eval("#ocr-save", button => button.click());
    await page.waitForFunction(() => document.getElementById("ocr-config-status").textContent === "OCR settings saved.", {timeout: 5000});
    assert.equal(integration.saves, 1); assert.deepEqual(integration.configuration.languageProviders, {english: "paddleocr"});
    assert.equal(integration.configuration.model, "gpt-6-astra");
    if (process.env.RHX_OCR_SCREENSHOT_DIR) {
      await fs.mkdir(process.env.RHX_OCR_SCREENSHOT_DIR, {recursive: true});
      await page.screenshot({path: path.join(process.env.RHX_OCR_SCREENSHOT_DIR, "image-ocr-languages-desktop.png"), fullPage: true});
    }
    await page.close(); page = await openPage(390, 1, true);
    assert.equal(await page.$eval('[data-language="english"]', select => select.value), "paddleocr");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.select('[data-language="english"]', "deepseek");
    await page.$eval("#ocr-canvas", canvas => canvas.scrollIntoView({block: "center"}));
    const mobile = await canvasBox(page);
    await page.mouse.move(mobile.x + 30, mobile.y + 40); await page.mouse.down(); await page.mouse.move(mobile.x + 100, mobile.y + 60); await page.mouse.up();
    await page.$eval("#ocr-extract", button => button.click());
    await page.waitForFunction(() => !document.getElementById("ocr-result").hidden, {timeout: 5000});
    assert.equal(integration.providerCalls[1].provider, "deepseek"); assert.equal(integration.saves, 1);
    assert.equal(integration.configuration.languageProviders.english, "paddleocr");
    await page.select("#ocr-test-language", "Malay");
    assert.match(await page.$eval("#ocr-test-provider", element => element.textContent), /OpenAI/);
    await page.$eval("#ocr-extract", button => button.click());
    await page.waitForFunction(() => !document.getElementById("ocr-result").hidden, {timeout: 5000});
    assert.equal(integration.providerCalls[2].provider, "openai"); assert.equal(integration.providerCalls[2].input.model, "gpt-6-astra");
    const result = await page.evaluate(async () => {
      const image = await new Promise(resolve => document.getElementById("ocr-canvas").toBlob(resolve, "image/png"));
      return window.ocrFeature.extractTextFromImage({image, language: "English"});
    });
    assert.equal(result.provider, "paddleocr"); assert.equal(integration.providerCalls[3].provider, "paddleocr");
    assert.equal(integration.saves, 1);
    if (process.env.RHX_OCR_SCREENSHOT_DIR) await page.screenshot({path: path.join(process.env.RHX_OCR_SCREENSHOT_DIR, "image-ocr-languages-mobile.png"), fullPage: true});
  } finally {await page.close();}
});
