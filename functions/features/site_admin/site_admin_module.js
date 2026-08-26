/**
 * External APIs:
 *
 * listSiteAdminEmails() -> Promise<string[]>
 * addSiteAdminEmail(email: string) -> Promise<string>
 * removeSiteAdminEmail(email: string) -> Promise<string>
 * isSiteAdmin(email: string) -> Promise<boolean>
 */
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
const {
  FirestoreSiteAdminRepository,
} = require("./infrastructure/firestore_site_admin_repository");

const siteAdminRepository = new FirestoreSiteAdminRepository();
const addSiteAdminEmailUseCase = new AddSiteAdminEmail(siteAdminRepository);
const isSiteAdminUseCase = new IsSiteAdmin(siteAdminRepository);
const listSiteAdminEmailsUseCase = new ListSiteAdminEmails(
  siteAdminRepository,
);
const removeSiteAdminEmailUseCase = new RemoveSiteAdminEmail(
  siteAdminRepository,
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

async function isSiteAdmin(email) {
  return isSiteAdminUseCase.execute(email);
}

module.exports = {
  listSiteAdminEmails,
  addSiteAdminEmail,
  removeSiteAdminEmail,
  isSiteAdmin,
};
