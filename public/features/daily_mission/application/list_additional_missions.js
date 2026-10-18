import {ListAdditionalMissionPracticeIds} from "./list_additional_mission_practice_ids.js?v=20261018-additional-essay-v1";
class ListAdditionalMissions extends ListAdditionalMissionPracticeIds {
  async execute(input) {return this.listMissions(input, {includeEssays: true});}
}
export {ListAdditionalMissions};
