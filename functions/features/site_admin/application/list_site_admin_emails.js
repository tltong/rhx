class ListSiteAdminEmails {
  constructor(siteAdminRepository) {
    this.siteAdminRepository = siteAdminRepository;
  }

  async execute() {
    return this.siteAdminRepository.listEmails();
  }
}

module.exports = {
  ListSiteAdminEmails,
};
