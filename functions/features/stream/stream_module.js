/**
 * Public APIs:
 *
 * createStream({name, country, level}) -> Promise<Stream>
 * getStreamById(streamId) -> Promise<Stream|null>
 * listStreams() -> Promise<Stream[]>
 * listStreamsByScope(country, level, year) -> Promise<Stream[]>
 * renameStream(streamId, name) -> Promise<Stream>
 * deleteStream(streamId) -> Promise<void>
 * attachSyllabusToStreamYear({streamId, year, syllabusId, language})
 *   -> Promise<StreamYearAssignment>
 * detachSyllabusFromStreamYear({streamId, year, syllabusId})
 *   -> Promise<StreamYearAssignment|null>
 * listStreamCountries() -> Promise<string[]>
 * listStreamLevels(country) -> Promise<string[]>
 * listStreamYears(country, level) -> Promise<number[]>
 * listEligibleSyllabuses({country, level, year})
 *   -> Promise<Array<{id, year, subject, languages, active}>>
 */
const {
  findSyllabusScopeByCountry,
  listSyllabusScopes,
} = require("../syllabusscope/syllabusscope_module");
const {
  getSyllabusById,
  listSyllabuses,
} = require("../syllabus/syllabus_module");
const {
  AttachSyllabusToYear,
} = require("./application/attach_syllabus_to_year");
const { CreateStream } = require("./application/create_stream");
const { DeleteStream } = require("./application/delete_stream");
const {
  DetachSyllabusFromYear,
} = require("./application/detach_syllabus_from_year");
const { GetStream } = require("./application/get_stream");
const {
  ListEligibleSyllabuses,
} = require("./application/list_eligible_syllabuses");
const {
  ListStreamCountries,
} = require("./application/list_stream_countries");
const {
  ListStreamLevels,
} = require("./application/list_stream_levels");
const { ListStreams } = require("./application/list_streams");
const {
  ListStreamsByScope,
} = require("./application/list_streams_by_scope");
const {
  ListStreamYears,
} = require("./application/list_stream_years");
const { RenameStream } = require("./application/rename_stream");
const {
  FirestoreStreamRepository,
} = require("./infrastructure/firestore_stream_repository");

const streamRepository = new FirestoreStreamRepository();
const createStreamUseCase = new CreateStream({
  streamRepository,
  findSyllabusScopeByCountry,
});
const getStreamUseCase = new GetStream(streamRepository);
const listStreamsUseCase = new ListStreams(streamRepository);
const listStreamsByScopeUseCase = new ListStreamsByScope(streamRepository);
const renameStreamUseCase = new RenameStream({streamRepository});
const deleteStreamUseCase = new DeleteStream(streamRepository);
const attachSyllabusToYearUseCase = new AttachSyllabusToYear({
  streamRepository,
  findSyllabusScopeByCountry,
  getSyllabusById,
});
const detachSyllabusFromYearUseCase = new DetachSyllabusFromYear({
  streamRepository,
});
const listStreamCountriesUseCase = new ListStreamCountries(
  listSyllabusScopes,
);
const listStreamLevelsUseCase = new ListStreamLevels(
  findSyllabusScopeByCountry,
);
const listStreamYearsUseCase = new ListStreamYears(
  findSyllabusScopeByCountry,
);
const listEligibleSyllabusesUseCase = new ListEligibleSyllabuses({
  findSyllabusScopeByCountry,
  listSyllabuses,
});

async function createStream(input) {
  return createStreamUseCase.execute(input);
}

async function getStreamById(streamId) {
  return getStreamUseCase.execute(streamId);
}

async function listStreams() {
  return listStreamsUseCase.execute();
}

async function listStreamsByScope(country, level, year) {
  return listStreamsByScopeUseCase.execute(country, level, year);
}

async function renameStream(streamId, name) {
  return renameStreamUseCase.execute(streamId, name);
}

async function deleteStream(streamId) {
  return deleteStreamUseCase.execute(streamId);
}

async function attachSyllabusToStreamYear(input) {
  return attachSyllabusToYearUseCase.execute(input);
}

async function detachSyllabusFromStreamYear(input) {
  return detachSyllabusFromYearUseCase.execute(input);
}

async function listStreamCountries() {
  return listStreamCountriesUseCase.execute();
}

async function listStreamLevels(country) {
  return listStreamLevelsUseCase.execute(country);
}

async function listStreamYears(country, level) {
  return listStreamYearsUseCase.execute(country, level);
}

async function listEligibleSyllabuses(input) {
  return listEligibleSyllabusesUseCase.execute(input);
}

module.exports = {
  createStream,
  getStreamById,
  listStreams,
  listStreamsByScope,
  renameStream,
  deleteStream,
  attachSyllabusToStreamYear,
  detachSyllabusFromStreamYear,
  listStreamCountries,
  listStreamLevels,
  listStreamYears,
  listEligibleSyllabuses,
};
