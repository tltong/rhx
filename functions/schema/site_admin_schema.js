const SITE_ADMINS_COLLECTION = "siteAdmins";

const siteAdminSchema = Object.freeze({
  documentId: "normalized_email",
  fields: Object.freeze({}),
});

module.exports = {
  SITE_ADMINS_COLLECTION,
  siteAdminSchema,
};
