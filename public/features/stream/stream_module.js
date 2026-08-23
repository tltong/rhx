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
import {
  findSyllabusScopeByCountry,
  listSyllabusScopes
} from "../syllabusscope/syllabusscope_module.js?v=20260823-stream-feature";
import {
  getSyllabusById,
  listSyllabuses
} from "../syllabus/syllabus_module.js?v=20260823-stream-feature";
import {
  AttachSyllabusToYear
} from "./application/attach_syllabus_to_year.js?v=20260823-stream-language-v1";
import {
  CreateStream
} from "./application/create_stream.js?v=20260823-stream-language-v1";
import {
  DeleteStream
} from "./application/delete_stream.js?v=20260823-stream-feature";
import {
  DetachSyllabusFromYear
} from "./application/detach_syllabus_from_year.js?v=20260823-stream-feature";
import {
  GetStream
} from "./application/get_stream.js?v=20260823-stream-feature";
import {
  ListEligibleSyllabuses
} from "./application/list_eligible_syllabuses.js?v=20260823-stream-all-syllabuses-v2";
import {
  ListStreamCountries
} from "./application/list_stream_countries.js?v=20260823-stream-feature";
import {
  ListStreamLevels
} from "./application/list_stream_levels.js?v=20260823-stream-feature";
import {
  ListStreams
} from "./application/list_streams.js?v=20260823-stream-feature";
import {
  ListStreamsByScope
} from "./application/list_streams_by_scope.js?v=20260823-student-standard-stream-v1";
import {
  ListStreamYears
} from "./application/list_stream_years.js?v=20260823-stream-feature";
import {
  RenameStream
} from "./application/rename_stream.js?v=20260823-stream-feature";
import {
  FirestoreStreamRepository
} from "./infrastructure/firestore_stream_repository.js?v=20260823-stream-language-v1";

const streamRepository = new FirestoreStreamRepository();
const createStreamUseCase = new CreateStream({
  streamRepository,
  findSyllabusScopeByCountry
});
const getStreamUseCase = new GetStream(streamRepository);
const listStreamsUseCase = new ListStreams(streamRepository);
const listStreamsByScopeUseCase = new ListStreamsByScope(streamRepository);
const renameStreamUseCase = new RenameStream({ streamRepository });
const deleteStreamUseCase = new DeleteStream(streamRepository);
const attachSyllabusToYearUseCase = new AttachSyllabusToYear({
  streamRepository,
  findSyllabusScopeByCountry,
  getSyllabusById
});
const detachSyllabusFromYearUseCase = new DetachSyllabusFromYear({
  streamRepository
});
const listStreamCountriesUseCase = new ListStreamCountries(
  listSyllabusScopes
);
const listStreamLevelsUseCase = new ListStreamLevels(
  findSyllabusScopeByCountry
);
const listStreamYearsUseCase = new ListStreamYears(
  findSyllabusScopeByCountry
);
const listEligibleSyllabusesUseCase = new ListEligibleSyllabuses({
  findSyllabusScopeByCountry,
  listSyllabuses
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

export {
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
  listEligibleSyllabuses
};
