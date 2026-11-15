const {requireSignedIn} = require("../infrastructure/news_config_access");
class GetNewsConfiguration {
  constructor({loadConfiguration}) {this.loadConfiguration = loadConfiguration;}
  execute(_input, context) {requireSignedIn(context); return this.loadConfiguration();}
}
module.exports = {GetNewsConfiguration};
