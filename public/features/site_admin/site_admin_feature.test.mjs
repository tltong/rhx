import assert from "node:assert/strict";
import test from "node:test";

import { AddSiteAdminEmail } from "./application/add_site_admin_email.js";
import {
  IsCurrentUserSiteAdmin
} from "./application/is_current_user_site_admin.js";
import {
  RequireCurrentSiteAdmin
} from "./application/require_current_site_admin.js";

test("browser add application normalizes the requested email", async () => {
  let requestedEmail = null;
  const useCase = new AddSiteAdminEmail({
    addEmail: async (email) => {
      requestedEmail = email;
      return {email, bootstrap: true};
    }
  });
  const result = await useCase.execute(" Admin@Example.COM ");

  assert.equal(requestedEmail, "admin@example.com");
  assert.deepEqual(result, {
    email: "admin@example.com",
    bootstrap: true
  });
});

test("current status uses only the server-derived caller email", async () => {
  const useCase = new IsCurrentUserSiteAdmin({
    getCurrentStatus: async () => ({
      email: "Current@Example.com",
      emailVerified: true,
      isAdmin: true,
      bootstrapAvailable: false
    })
  });

  assert.deepEqual(await useCase.execute(), {
    email: "current@example.com",
    emailVerified: true,
    isAdmin: true,
    bootstrapAvailable: false
  });
});

test("future page guard rejects a non-admin account", async () => {
  const useCase = new RequireCurrentSiteAdmin(async () => ({
    email: "visitor@example.com",
    emailVerified: true,
    isAdmin: false
  }));

  await assert.rejects(
    () => useCase.execute(),
    /not a site administrator/
  );
});
