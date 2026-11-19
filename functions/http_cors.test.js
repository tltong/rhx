const assert = require("node:assert/strict");
const {test, afterEach} = require("node:test");
const {EventEmitter} = require("node:events");
const fs = require("node:fs");
const path = require("node:path");
const {parseEnv} = require("node:util");

const endpoints = [
  {module: "./deepseek", name: "generateDeepseekText", noOriginHeader: "*"},
  {module: "./image_generation_http", name: "generateLlmImage"},
  {module: "./image_ocr_http", name: "extractLlmImageText"},
];
const originalOrigins = process.env.ALLOWED_WEB_ORIGINS;
afterEach(() => {
  if (originalOrigins === undefined) delete process.env.ALLOWED_WEB_ORIGINS;
  else process.env.ALLOWED_WEB_ORIGINS = originalOrigins;
  for (const endpoint of endpoints) delete require.cache[require.resolve(endpoint.module)];
});

function loadFunction(projectId, endpoint) {
  const configuration = parseEnv(fs.readFileSync(path.join(__dirname, `.env.${projectId}`), "utf8"));
  process.env.ALLOWED_WEB_ORIGINS = configuration.ALLOWED_WEB_ORIGINS;
  delete require.cache[require.resolve(endpoint.module)];
  return require(endpoint.module)[endpoint.name];
}

class Response extends EventEmitter {
  constructor() {super(); this.headers = {}; this.statusCode = 200;}
  setHeader(name, value) {this.headers[name.toLowerCase()] = value;}
  getHeader(name) {return this.headers[name.toLowerCase()];}
  set(name, value) {this.setHeader(name, value); return this;}
  status(code) {this.statusCode = code; return this;}
  end(body) {this.body = body; this.emit("finish"); return this;}
  json(body) {return this.end(body);}
  send(body) {return this.end(body);}
}

async function invoke(handler, method, origin) {
  const headers = {"access-control-request-method": "POST", "access-control-request-headers": "content-type,authorization"};
  if (origin !== undefined) headers.origin = origin;
  const req = {method, headers, get: name => headers[name.toLowerCase()], header: name => headers[name.toLowerCase()]};
  const res = new Response();
  await handler(req, res);
  return res;
}

for (const endpoint of endpoints) {
  for (const [projectId, otherProject] of [["readyherox", "rhx-staging"], ["rhx-staging", "readyherox"]]) {
    test(`${endpoint.name} in ${projectId}: real Firebase preflight and handler responses use the project's own origin list`, async () => {
      const handler = loadFunction(projectId, endpoint);
      for (const origin of [`https://${projectId}.web.app`, `https://${projectId}.firebaseapp.com`, "http://localhost:5000", "http://127.0.0.1:8080"]) {
        const preflight = await invoke(handler, "OPTIONS", origin);
        assert.equal(preflight.statusCode, 204);
        assert.equal(preflight.getHeader("Access-Control-Allow-Origin"), origin);
        // Exercise response headers through the real handler as well as the
        // preflight middleware, without making an external API request.
        const response = await invoke(handler, "GET", origin);
        assert.equal(response.statusCode, 405);
        assert.equal(response.getHeader("Access-Control-Allow-Origin"), origin);
        assert.equal(response.getHeader("Access-Control-Expose-Headers"), "X-Request-ID");
      }
      for (const origin of [`https://${otherProject}.web.app`, `https://${otherProject}.firebaseapp.com`,
        `https://${projectId}.web.app.evil.test`, "https://unrelated.example.test", "null"]) {
        for (const method of ["OPTIONS", "GET"]) {
          const response = await invoke(handler, method, origin);
          assert.equal(response.getHeader("Access-Control-Allow-Origin"), undefined);
        }
      }
      const noOrigin = await invoke(handler, "GET");
      assert.equal(noOrigin.statusCode, 405);
      assert.equal(noOrigin.getHeader("Access-Control-Allow-Origin"), endpoint.noOriginHeader);
    });
  }

  test(`${endpoint.name}: missing configuration permits no deployed website`, async () => {
    delete process.env.ALLOWED_WEB_ORIGINS;
    delete require.cache[require.resolve(endpoint.module)];
    const handler = require(endpoint.module)[endpoint.name];
    for (const origin of ["https://readyherox.web.app", "https://rhx-staging.web.app"]) {
      for (const method of ["OPTIONS", "GET"]) {
        assert.equal((await invoke(handler, method, origin)).getHeader("Access-Control-Allow-Origin"), undefined);
      }
    }
  });
}
