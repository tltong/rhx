const assert = require("node:assert/strict");
const test = require("node:test");

const {
  AddSiteAdminEmail,
} = require("./application/add_site_admin_email");
const {
  IsSiteAdmin,
} = require("./application/is_site_admin");
const {
  ListSiteAdminEmails,
} = require("./application/list_site_admin_emails");
const {
  RemoveSiteAdminEmail,
} = require("./application/remove_site_admin_email");

function createRepository(initialEmails = []) {
  const emails = new Set(initialEmails);

  return {
    exists: async (email) => emails.has(email),
    listEmails: async () => [...emails].sort(),
    save: async (email) => emails.add(email),
    delete: async (email) => emails.delete(email),
  };
}

test("site-admin applications normalize and manage email document IDs", async () => {
  const repository = createRepository();
  const add = new AddSiteAdminEmail(repository);
  const list = new ListSiteAdminEmails(repository);
  const isAdmin = new IsSiteAdmin(repository);
  const remove = new RemoveSiteAdminEmail(repository);

  assert.equal(await add.execute(" Admin@Example.COM "), "admin@example.com");
  assert.deepEqual(await list.execute(), ["admin@example.com"]);
  assert.equal(await isAdmin.execute("ADMIN@example.com"), true);
  assert.equal(await remove.execute("admin@example.com"), "admin@example.com");
  assert.equal(await isAdmin.execute("admin@example.com"), false);
});

test("site-admin emails cannot contain a Firestore path separator", async () => {
  const add = new AddSiteAdminEmail(createRepository());

  await assert.rejects(
    () => add.execute("admin/team@example.com"),
    /valid site-admin email/,
  );
});
