/** School/location read APIs require a signed-in user; mutations require a verified administrator.
 * Mutations take {id, expectedVersion, ...changes}; creates generate the ID/version.
 * Lists return {items, nextCursor}. See docs/school-directory.md for the API contract.
 */
const {createSchoolService} = require("./application/school_service");
const {FirestoreSchoolRepository} = require("./infrastructure/firestore_school_repository");
const {createSchoolAuthorizer} = require("./infrastructure/access");
function createSchoolFeature({repository = new FirestoreSchoolRepository(), authorize = createSchoolAuthorizer(), now} = {}) {
  return createSchoolService({repository, authorize, now});
}
module.exports = {createSchoolFeature, ...createSchoolFeature()};
