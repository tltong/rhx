/**
 * Public APIs:
 *
 * listSiteAdminEmails()
 *   -> Promise<{emails: string[], bootstrapAvailable: boolean}>
 * addSiteAdminEmail(email)
 *   -> Promise<{email: string, bootstrap: boolean}>
 * removeSiteAdminEmail(email) -> Promise<string>
 * isCurrentUserSiteAdmin()
 *   -> Promise<{
 *     email: string|null,
 *     emailVerified: boolean,
 *     isAdmin: boolean,
 *     bootstrapAvailable: boolean
 *   }>
 * requireCurrentSiteAdmin() -> Promise<SiteAdminStatus>
 */
import {
  AddSiteAdminEmail
} from "./application/add_site_admin_email.js";
import {
  IsCurrentUserSiteAdmin
} from "./application/is_current_user_site_admin.js";
import {
  ListSiteAdminEmails
} from "./application/list_site_admin_emails.js";
import {
  RemoveSiteAdminEmail
} from "./application/remove_site_admin_email.js";
import {
  RequireCurrentSiteAdmin
} from "./application/require_current_site_admin.js";
import {
  FirebaseCallableSiteAdminGateway
} from "./infrastructure/firebase_callable_site_admin_gateway.js";

const siteAdminGateway = new FirebaseCallableSiteAdminGateway();
const addSiteAdminEmailUseCase = new AddSiteAdminEmail(siteAdminGateway);
const isCurrentUserSiteAdminUseCase = new IsCurrentUserSiteAdmin(
  siteAdminGateway
);
const listSiteAdminEmailsUseCase = new ListSiteAdminEmails(siteAdminGateway);
const removeSiteAdminEmailUseCase = new RemoveSiteAdminEmail(siteAdminGateway);
const requireCurrentSiteAdminUseCase = new RequireCurrentSiteAdmin(
  () => isCurrentUserSiteAdminUseCase.execute()
);

async function listSiteAdminEmails() {
  return listSiteAdminEmailsUseCase.execute();
}

async function addSiteAdminEmail(email) {
  return addSiteAdminEmailUseCase.execute(email);
}

async function removeSiteAdminEmail(email) {
  return removeSiteAdminEmailUseCase.execute(email);
}

async function isCurrentUserSiteAdmin() {
  return isCurrentUserSiteAdminUseCase.execute();
}

async function requireCurrentSiteAdmin() {
  return requireCurrentSiteAdminUseCase.execute();
}

export {
  addSiteAdminEmail,
  isCurrentUserSiteAdmin,
  listSiteAdminEmails,
  removeSiteAdminEmail,
  requireCurrentSiteAdmin
};
