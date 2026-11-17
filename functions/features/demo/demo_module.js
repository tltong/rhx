const {FirestoreDemoRepository} = require("./infrastructure/firestore_demo_repository");
const {createDemoContentGateway} = require("./infrastructure/demo_content_gateway");
const {createDemoService} = require("./application/demo_service");
const {createDemoNews} = require("./application/demo_news");
function createDemoFeature({repository = new FirestoreDemoRepository(), content = createDemoContentGateway(), news, now} = {}) {
  return createDemoService({repository, content, news: news || createDemoNews({repository, now}), now});
}
module.exports = {createDemoFeature};
