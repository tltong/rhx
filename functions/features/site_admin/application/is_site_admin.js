const {
  normalizeSiteAdminEmail,
} = require("../domain/site_admin_email");

class IsSiteAdmin {
  constructor(siteAdminRepository) {
    this.siteAdminRepository = siteAdminRepository;
  }

  async execute(email) {
    return this.siteAdminRepository.exists(normalizeSiteAdminEmail(email));
  }
}

module.exports = {
  IsSiteAdmin,
};
