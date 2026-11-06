import {ListAdditionalMissionPracticeIds} from "./list_additional_mission_practice_ids.js?v=20261104-fill-preassessment-v3";
class ListAdditionalMissions extends ListAdditionalMissionPracticeIds {
  async execute(input) {return this.listMissions(input, {includeEssays: true});}
}
export {ListAdditionalMissions};
