class SiteAdminRepository {
  async exists(_email) {
    throw new Error("exists() is not implemented.");
  }

  async listEmails() {
    throw new Error("listEmails() is not implemented.");
  }

  async save(_email) {
    throw new Error("save() is not implemented.");
  }

  async delete(_email) {
    throw new Error("delete() is not implemented.");
  }
}

module.exports = {
  SiteAdminRepository,
};
