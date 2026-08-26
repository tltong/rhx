const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createSiteAdminHandlers,
} = require("./site_admin");

function createHarness(initialEmails = []) {
  const emails = new Set(initialEmails);
  const handlers = createSiteAdminHandlers({
    addAdmin: async (email) => {
      emails.add(email);
      return email;
    },
    checkSiteAdmin: async (email) => emails.has(email),
    listAdmins: async () => [...emails].sort(),
    removeAdmin: async (email) => {
      emails.delete(email);
      return email;
    },
  });

  return {emails, handlers};
}

function authenticatedRequest(email, data = {}) {
  return {
    auth: {
      uid: "user-1",
      token: {
        email,
        email_verified: true,
      },
    },
    data,
  };
}

test("first administrator can bootstrap only their own verified email", async () => {
  const {emails, handlers} = createHarness();
  const result = await handlers.addHandler(
    authenticatedRequest("Owner@Example.com", {email: "owner@example.com"}),
  );

  assert.deepEqual(result, {
    email: "owner@example.com",
    bootstrap: true,
  });
  assert.equal(emails.has("owner@example.com"), true);
});

test("first administrator cannot bootstrap a different email", async () => {
  const {handlers} = createHarness();

  await assert.rejects(
    () => handlers.addHandler(
      authenticatedRequest("owner@example.com", {email: "other@example.com"}),
    ),
    (error) => error.code === "permission-denied",
  );
});

test("existing administrator can add and list another email", async () => {
  const {handlers} = createHarness(["owner@example.com"]);

  await handlers.addHandler(
    authenticatedRequest("owner@example.com", {email: "second@example.com"}),
  );
  const result = await handlers.listHandler(
    authenticatedRequest("owner@example.com"),
  );

  assert.deepEqual(result.emails, [
    "owner@example.com",
    "second@example.com",
  ]);
});

test("current status never accepts a caller-supplied email", async () => {
  const {handlers} = createHarness(["owner@example.com"]);
  const result = await handlers.currentStatusHandler({
    ...authenticatedRequest("visitor@example.com"),
    data: {email: "owner@example.com"},
  });

  assert.equal(result.email, "visitor@example.com");
  assert.equal(result.isAdmin, false);
});
