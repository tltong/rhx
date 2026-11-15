const {FirestoreNewsConfigRepository} = require("./infrastructure/firestore_news_config_repository");
const {requireNewsAdministrator} = require("./infrastructure/news_config_access");
const {GetNewsConfiguration} = require("./application/get_news_configuration");
const {SaveNewsConfiguration} = require("./application/save_news_configuration");
const {resolveNewsGradeSettings} = require("./domain/news_config");
const {listSyllabusScopeLanguages} = require("../syllabusscope/syllabusscope_module");
const {createStudentNewsService} = require("./application/student_news_service");

function createStudentNewsFeature({repository = new FirestoreNewsConfigRepository(), requireAdministrator = requireNewsAdministrator, listLanguages = listSyllabusScopeLanguages} = {}) {
  async function loadNewsConfiguration() {
    const [configuration, supportedLanguages] = await Promise.all([repository.get(), listLanguages()]);
    return {...configuration, supportedLanguages};
  }
  const get = new GetNewsConfiguration({loadConfiguration: loadNewsConfiguration}), save = new SaveNewsConfiguration({repository, requireAdministrator, listLanguages});
  return {
    ...createStudentNewsService({loadConfiguration: loadNewsConfiguration, requireAdministrator}),
    getNewsConfiguration: (input, context) => get.execute(input, context),
    saveNewsConfiguration: (input, context) => save.execute(input, context),
    // Trusted backend helpers; these are not exposed by the callable.
    loadNewsConfiguration,
    getEffectiveNewsGradeSettings: async criteria => resolveNewsGradeSettings(await repository.get(), criteria),
  };
}
module.exports = {...createStudentNewsFeature(), createStudentNewsFeature};
