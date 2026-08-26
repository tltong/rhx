const {
  SITE_ADMINS_COLLECTION,
} = require("../../../schema/site_admin_schema");
const {
  deleteDocument,
  readCollectionIds,
  readDocument,
  writeDocument,
} = require("../../../utils/firebase/firebase_ops");
const {
  normalizeSiteAdminEmail,
} = require("../domain/site_admin_email");
const {
  SiteAdminRepository,
} = require("../domain/site_admin_repository");

class FirestoreSiteAdminRepository extends SiteAdminRepository {
  async exists(email) {
    const normalizedEmail = normalizeSiteAdminEmail(email);
    const document = await readDocument(
      SITE_ADMINS_COLLECTION,
      normalizedEmail,
      {includeId: false},
    );

    return document !== null;
  }

  async listEmails() {
    const emails = await readCollectionIds(SITE_ADMINS_COLLECTION);

    return emails
      .map(normalizeSiteAdminEmail)
      .sort((first, second) => first.localeCompare(second));
  }

  async save(email) {
    const normalizedEmail = normalizeSiteAdminEmail(email);

    await writeDocument(
      SITE_ADMINS_COLLECTION,
      normalizedEmail,
      {},
      {merge: false},
    );

    return normalizedEmail;
  }

  async delete(email) {
    const normalizedEmail = normalizeSiteAdminEmail(email);

    await deleteDocument(SITE_ADMINS_COLLECTION, normalizedEmail);

    return normalizedEmail;
  }
}

module.exports = {
  FirestoreSiteAdminRepository,
};
