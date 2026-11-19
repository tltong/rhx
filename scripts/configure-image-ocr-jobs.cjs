// Invoked by the deployment wrapper, which supplies temporary ADC and proxy setup.
const fs = require("node:fs");
const path = require("node:path");
const {parseArgs, parseEnv} = require("node:util");
const {requireOcrJobsBucketName} = require("../functions/features/image_ocr/infrastructure/ocr_job_bucket_config");
const REGION = "us-central1";

function requireProjectId(projectId) {
  if (typeof projectId !== "string" || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId)) {
    throw new Error("An explicit valid Firebase project ID is required (--project).");
  }
  return projectId;
}

function getSetupOptions(args) {
  const {values} = parseArgs({args, options: {project: {type: "string"}, bucket: {type: "string"}}});
  const projectId = requireProjectId(values.project);
  const filename = path.join(__dirname, "../functions", `.env.${projectId}`);
  const configuration = fs.existsSync(filename) ? parseEnv(fs.readFileSync(filename, "utf8")) : {};
  const bucketName = requireOcrJobsBucketName(values.bucket ?? configuration.IMAGE_OCR_JOBS_BUCKET);
  return {projectId, bucketName};
}

function matchesPolicy(metadata) {
  return metadata.iamConfiguration?.uniformBucketLevelAccess?.enabled === true &&
    metadata.iamConfiguration?.publicAccessPrevention === "enforced" &&
    !metadata.versioning?.enabled && !(metadata.softDeletePolicy?.retentionDurationSeconds > 0) &&
    metadata.lifecycle?.rule?.some(rule => rule.action?.type === "Delete" && rule.condition?.age === 1 &&
      Object.keys(rule.condition).length === 1);
}

async function configureOcrJobs({storage, functions, projects, projectId, bucketName}) {
  requireProjectId(projectId);
  requireOcrJobsBucketName(bucketName);
  const project = (await projects.get(`projects/${projectId}`)).body;
  if (project.projectId !== projectId || !/^\d+$/.test(String(project.projectNumber)) || project.lifecycleState !== "ACTIVE") {
    throw new Error("Cannot verify the selected active project's ownership; no changes applied.");
  }
  const projectNumber = String(project.projectNumber);
  const accounts = new Set([`${projectNumber}-compute@developer.gserviceaccount.com`]);
  for (const functionId of ["extractLlmImageText", "processImageOcrJob"]) {
    try {
      const backend = (await functions.get(`projects/${projectId}/locations/${REGION}/functions/${functionId}`)).body;
      const account = backend.serviceConfig?.serviceAccountEmail;
      if (!account || !/^[^@\s]+@[^@\s]+\.gserviceaccount\.com$/.test(account)) {
        throw new Error(`Cannot verify ${functionId}'s runtime account; no changes applied.`);
      }
      accounts.add(account);
    } catch (error) {
      // Before the first deployment, these functions use the default compute account.
      if (error.status !== 404) throw error;
    }
  }
  const resource = `b/${bucketName}`;
  const policy = {iamConfiguration: {uniformBucketLevelAccess: {enabled: true}, publicAccessPrevention: "enforced"},
    lifecycle: {rule: [{action: {type: "Delete"}, condition: {age: 1}}]},
    versioning: {enabled: false}, softDeletePolicy: {retentionDurationSeconds: "0"}};
  let metadata;
  try {metadata = (await storage.get(resource)).body;}
  catch (error) {if (error.status !== 404) throw error;}
  if (metadata && (String(metadata.projectNumber) !== projectNumber || metadata.location?.toLowerCase() !== REGION)) {
    throw new Error("The OCR bucket belongs to another project or region; no changes applied.");
  }
  if (metadata?.retentionPolicy?.retentionPeriod > 0) {
    throw new Error("An existing retention policy prevents temporary OCR cleanup; no changes applied.");
  }
  const bucketCreated = !metadata;
  let policyUpdated = false;
  if (!metadata) {
    metadata = (await storage.post("b", {name: bucketName, location: REGION, storageClass: "STANDARD", ...policy},
      {queryParams: {project: projectId}})).body;
    if (String(metadata.projectNumber) !== projectNumber || metadata.location?.toLowerCase() !== REGION) {
      throw new Error("The created bucket's project or region could not be verified; IAM was not modified.");
    }
  } else if (!matchesPolicy(metadata)) {
    await storage.patch(resource, policy);
    policyUpdated = true;
  }
  const iam = (await storage.get(resource + "/iam", {queryParams: {optionsRequestedPolicyVersion: 3}})).body;
  iam.bindings ||= [];
  let iamUpdated = false;
  for (const role of ["roles/storage.objectAdmin", "roles/storage.legacyBucketReader"]) {
    let binding = iam.bindings.find(binding => binding.role === role && !binding.condition);
    if (!binding) {binding = {role, members: []}; iam.bindings.push(binding);}
    for (const account of accounts) {
      const member = `serviceAccount:${account}`;
      if (!binding.members.includes(member)) {binding.members.push(member); iamUpdated = true;}
    }
  }
  if (iamUpdated) await storage.put(resource + "/iam", {bindings: iam.bindings, etag: iam.etag, version: iam.version || 3});
  return {project: projectId, bucket: bucketName, region: REGION, publicAccessPrevention: "enforced",
    deletionEligibility: "1 day", softDelete: false, versioning: false,
    runtimeAccountsConfigured: accounts.size, bucketCreated, policyUpdated, iamUpdated};
}
async function main() {
  const options = getSetupOptions(process.argv.slice(2));
  const {createRequire} = require("node:module");
  const dependencies = require(process.env.RHX_FIREBASE_DEPENDENCIES);
  const firebase = createRequire(dependencies["firebase-tools"].entry);
  const {Client} = firebase(dependencies["firebase-tools"].directory + "/lib/apiv2");
  await firebase(dependencies["firebase-tools"].directory + "/lib/requireAuth").requireAuth({project: options.projectId, nonInteractive: true});
  const storage = new Client({urlPrefix: "https://storage.googleapis.com", apiVersion: "storage/v1"});
  const functions = new Client({urlPrefix: "https://cloudfunctions.googleapis.com", apiVersion: "v2"});
  const projects = new Client({urlPrefix: "https://cloudresourcemanager.googleapis.com", apiVersion: "v1"});
  console.log(JSON.stringify(await configureOcrJobs({storage, functions, projects, ...options})));
}
if (require.main === module) main().catch(error => {
  const message = error.context?.body?.error?.message || error.message;
  console.error("OCR storage setup failed:", error.status || error.code || "unknown", message);
  process.exitCode = 1;
});
module.exports = {configureOcrJobs, getSetupOptions};
