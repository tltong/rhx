const {ListAdditionalMissionPracticeIds} = require("./list_additional_mission_practice_ids");
class ListAdditionalMissions extends ListAdditionalMissionPracticeIds {
  async execute(input) {return this.listMissions(input, {includeEssays: true});}
}
module.exports = {ListAdditionalMissions};
