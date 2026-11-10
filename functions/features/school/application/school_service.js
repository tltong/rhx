const {problem, object, identifier, version, changes, listInput} = require("../domain/school");
const {syllabusScopeGradeNumbers} = require("../../../schema/syllabusscope_schema");
function createSchoolService({repository, authorize, now = () => new Date()}) {
  async function get(kind, input, context) {
    const access = await authorize({}, context);
    const record = await repository.get(kind, identifier(typeof input === "string" ? input : object(input).id));
    if (record && !access.administrator && record.status !== "active") return null;
    if (record && kind === "school" && repository.withLocationNames) return (await repository.withLocationNames([record]))[0];
    return record;
  }
  async function list(kind, input, context) {
    const access = await authorize({}, context);
    const page = await repository.list(kind, listInput(kind, input, access.administrator));
    if (kind === "school" && page.items.length && repository.withLocationNames) page.items = await repository.withLocationNames(page.items);
    return page;
  }
  async function validateReferences(unit, kind, data) {
    const scope = await unit.scope(data.country);
    if (!scope) throw problem("Choose a country defined in Syllabus Scope.", "failed-precondition");
    const grades = scope.levels === undefined ? scope[data.level] : scope.levels?.[data.level];
    if (kind === "school" && !Object.entries(grades || {}).some(([grade, enabled]) => syllabusScopeGradeNumbers.includes(grade) && Boolean(enabled))) {
      throw problem("This level is not available for the selected country.", "failed-precondition");
    }
    if (kind !== "state") {
      const state = await unit.get("state", data.stateId);
      if (!state || state.country !== data.country || (data.status === "active" && state.status !== "active")) {
        throw problem("Choose an active state in the selected country.", "failed-precondition");
      }
    }
    if (kind === "school") {
      const locality = await unit.get("locality", data.localityId);
      if (!locality || locality.country !== data.country || locality.stateId !== data.stateId ||
          (data.status === "active" && locality.status !== "active")) throw problem("Choose an active city/town in the selected state.", "failed-precondition");
      if (data.streamId) {
        const stream = await unit.get("stream", data.streamId);
        if (!stream || stream.country !== data.country || stream.level !== data.level) {
          throw problem("The stream must exist and match the school's country and level.", "failed-precondition");
        }
      }
    }
  }
  async function save(kind, raw, context, {create = false, archive = false, streamOnly = false} = {}) {
    const access = await authorize({write: true}, context), input = {...object(raw)};
    if (create && (input.id !== undefined || input.expectedVersion !== undefined)) throw problem("New records receive a generated ID and version.");
    if (archive) {
      if (Object.keys(input).some(key => !["id", "expectedVersion"].includes(key))) throw problem("Archive accepts only id and expectedVersion.");
      input.status = "archived";
    }
    if (streamOnly && Object.keys(input).some(key => !["id", "expectedVersion", "streamId"].includes(key))) throw problem("Stream assignment accepts only id, expectedVersion and streamId.");
    return repository.transaction(async unit => {
      const id = create ? unit.allocate(kind) : identifier(input.id);
      const current = create ? null : await unit.get(kind, id);
      if (!create && !current) throw problem("This record no longer exists.", "not-found");
      if (current && version(input.expectedVersion) !== current.version) throw problem("This record changed in another session. Reload it before saving.", "aborted");
      const data = changes(kind, input, current);
      await validateReferences(unit, kind, data);
      if (data.status === "archived" && current?.status === "active" && kind !== "school") {
        const filters = kind === "state" ? {stateId: id, status: "active"} : {localityId: id, status: "active"};
        const schools = await unit.find("school", filters);
        const localities = kind === "state" ? await unit.find("locality", filters) : [];
        if (schools.length || localities.length) throw problem("Archive or move active schools and cities/towns before archiving this location.", "failed-precondition");
      }
      const timestamp = now();
      const record = {...data, createdAt: current?.createdAt || timestamp, createdBy: current?.createdBy || access.uid,
        updatedAt: timestamp, updatedBy: access.uid, version: (current?.version || 0) + 1};
      unit.set(kind, id, record);
      return {...record, id};
    });
  }
  const api = {};
  for (const [kind, label] of [["state", "State"], ["locality", "Locality"], ["school", "School"]]) {
    api[`get${label}`] = (input, context) => get(kind, input, context);
    api[`list${label === "Locality" ? "Localities" : label + "s"}`] = (input = {}, context) => list(kind, input, context);
    api[`create${label}`] = (input, context) => save(kind, input, context, {create: true});
    api[`update${label}`] = (input, context) => save(kind, input, context);
    api[`archive${label}`] = (input, context) => save(kind, input, context, {archive: true});
  }
  api.listSchoolStreams = (input, context) => list("stream", input, context);
  api.assignSchoolStream = async (input, context) => {
    identifier(object(input).streamId, "streamId");
    return save("school", input, context, {streamOnly: true});
  };
  api.removeSchoolStream = async (input, context) => {
    if (Object.keys(object(input)).some(key => !["id", "expectedVersion"].includes(key))) throw problem("Removal accepts only id and expectedVersion.");
    return save("school", {...input, streamId: null}, context, {streamOnly: true});
  };
  return api;
}
module.exports = {createSchoolService};
