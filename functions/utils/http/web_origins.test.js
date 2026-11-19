const assert = require("node:assert/strict");
const {test} = require("node:test");
const {getAllowedWebOrigins, isAllowedWebOrigin} = require("./web_origins");

test("origin configuration trims and deduplicates exact HTTPS origins", () => {
  const origins = getAllowedWebOrigins(" https://app.example.test,https://admin.example.test, https://app.example.test, ");
  assert.equal(origins.length, 3);
  assert.equal(isAllowedWebOrigin("https://app.example.test", origins), true);
  assert.equal(isAllowedWebOrigin("https://admin.example.test", origins), true);
  for (const origin of ["https://app.example.test.evil.test", "https://other.example.test", "null", undefined]) {
    assert.equal(isAllowedWebOrigin(origin, origins), false);
  }
});

test("an empty setting retains local development without a production fallback", () => {
  const origins = getAllowedWebOrigins("");
  for (const origin of ["http://localhost:5000", "http://127.0.0.1:8080"]) {
    assert.equal(isAllowedWebOrigin(origin, origins), true);
  }
  for (const origin of ["https://readyherox.web.app", "https://rhx-staging.web.app", "http://localhost.evil.test:5000", "http://localhost", "http://192.168.1.10:5000"]) {
    assert.equal(isAllowedWebOrigin(origin, origins), false);
  }
});

test("malformed origins and broad permissions fail instead of changing browser access", () => {
  for (const value of ["*", "https://*.example.test", "not-a-url", "http://app.example.test", "https://app.example.test/",
    "https://app.example.test/path", "https://app.example.test?query=value", "https://app.example.test#fragment",
    "https://user:password@app.example.test", "https://app.example.test,invalid"]) {
    assert.throws(() => getAllowedWebOrigins(value), /ALLOWED_WEB_ORIGINS/);
  }
});
