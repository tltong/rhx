// Invoked by deploy-firebase.sh ocr-jobs, which supplies temporary ADC and proxy setup.
async function configureOcrJobs({storage, functions}) {
  const bucketName = "readyherox-ocr-jobs", path = `b/${bucketName}`;
  const backend = (await functions.get("projects/readyherox/locations/us-central1/functions/extractLlmImageText")).body;
  const policy = {iamConfiguration: {uniformBucketLevelAccess: {enabled: true}, publicAccessPrevention: "enforced"},
    lifecycle: {rule: [{action: {type: "Delete"}, condition: {age: 1}}]},
    versioning: {enabled: false}, softDeletePolicy: {retentionDurationSeconds: "0"}};
  let metadata;
  try {metadata = (await storage.get(path)).body;}
  catch (error) {if (error.status !== 404) throw error;}
  if (metadata && (String(metadata.projectNumber) !== "788606405643" || metadata.location.toLowerCase() !== "us-central1")) {
    throw new Error("The OCR bucket name is in another project or region; no changes applied.");
  }
  if (metadata?.retentionPolicy?.retentionPeriod > 0) throw new Error("An existing retention policy prevents temporary OCR cleanup; no changes applied.");
  if (!metadata) metadata = (await storage.post("b",
    {name: bucketName, location: "us-central1", storageClass: "STANDARD", ...policy},
    {queryParams: {project: "readyherox"}})).body;
  else await storage.patch(path, policy);
  const iam = (await storage.get(path + "/iam", {queryParams: {optionsRequestedPolicyVersion: 3}})).body;
  iam.bindings ||= [];
  const accounts = new Set([backend.serviceConfig.serviceAccountEmail,
    `${metadata.projectNumber}-compute@developer.gserviceaccount.com`]);
  for (const role of ["roles/storage.objectAdmin", "roles/storage.legacyBucketReader"]) {
    let binding = iam.bindings.find(binding => binding.role === role && !binding.condition);
    if (!binding) {binding = {role, members: []}; iam.bindings.push(binding);}
    for (const account of accounts) if (!binding.members.includes(`serviceAccount:${account}`)) binding.members.push(`serviceAccount:${account}`);
  }
  await storage.put(path + "/iam", {bindings: iam.bindings, etag: iam.etag, version: iam.version || 3});
  return {bucket: bucketName, region: "us-central1", publicAccessPrevention: "enforced",
    deletionEligibility: "1 day", softDelete: false, versioning: false, runtimeAccountsConfigured: accounts.size};
}
async function main() {
  const {createRequire} = require("node:module");
  const dependencies = require(process.env.RHX_FIREBASE_DEPENDENCIES);
  const firebase = createRequire(dependencies["firebase-tools"].entry);
  const {Client} = firebase(dependencies["firebase-tools"].directory + "/lib/apiv2");
  await firebase(dependencies["firebase-tools"].directory + "/lib/requireAuth").requireAuth({project: "readyherox", nonInteractive: true});
  const storage = new Client({urlPrefix: "https://storage.googleapis.com", apiVersion: "storage/v1"});
  const functions = new Client({urlPrefix: "https://cloudfunctions.googleapis.com", apiVersion: "v2"});
  console.log(JSON.stringify(await configureOcrJobs({storage, functions})));
}
if (require.main === module) main().catch(error => {
  const message = error.context?.body?.error?.message || "Check the deployment identity's bucket permissions and the setup policy.";
  console.error("OCR storage setup failed:", error.status || error.code || "unknown", message);
  process.exitCode = 1;
});
module.exports = {configureOcrJobs};
