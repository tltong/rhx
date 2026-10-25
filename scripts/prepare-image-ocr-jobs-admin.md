# One-time administrator setup for OCR background jobs

The deployment identity is
`codex-firebase-developer@readyherox.iam.gserviceaccount.com`.
Google Cloud rejected creation of `readyherox-ocr-jobs` with HTTP 403 because this
identity lacks `storage.buckets.create`. It also cannot change project IAM.
Firebase analyzes the Storage trigger during deployment, including deployments
targeting only the OCR gateway, so the bucket must exist first.

A project administrator can run these commands in Google Cloud Shell. They grant
the deployment identity Storage Admin on this dedicated bucket only. No project
Storage Admin role is needed for the deployment identity.

```sh
gcloud storage buckets create gs://readyherox-ocr-jobs \
  --project=readyherox \
  --location=us-central1 \
  --default-storage-class=STANDARD \
  --uniform-bucket-level-access \
  --public-access-prevention \
  --soft-delete-duration=0

gcloud storage buckets add-iam-policy-binding gs://readyherox-ocr-jobs \
  --member=serviceAccount:codex-firebase-developer@readyherox.iam.gserviceaccount.com \
  --role=roles/storage.admin

gcloud storage service-agent --project=readyherox

gcloud projects add-iam-policy-binding readyherox \
  --member=serviceAccount:service-788606405643@gs-project-accounts.iam.gserviceaccount.com \
  --role=roles/pubsub.publisher \
  --condition=None
```

If the bucket has already been created, skip the creation command after verifying
that it belongs to project `readyherox` (number `788606405643`) and is in
`us-central1`. The Storage service agent's Pub/Sub Publisher grant is required for
Google Cloud Storage events to reach the background worker.

Afterward, the existing deployment identity can run:

```sh
bash scripts/deploy-firebase.sh ocr-jobs
bash scripts/deploy-firebase.sh function processImageOcrJob
bash scripts/deploy-firebase.sh function extractLlmImageText
bash scripts/deploy-firebase.sh hosting
```

The first command applies the one-day cleanup policy, disables versioning and
soft delete, and grants the runtime accounts access to job objects and bucket
metadata. It validates the bucket project and region before changing its policy.
Deployment should then be checked with a generated image and a completed job,
including deletion of the input object and rejection of reads by another user.

PaddleOCR's Python function remains at zero minimum instances and does not need
redeployment for this change.

References:

- [Create a bucket](https://cloud.google.com/storage/docs/creating-buckets)
- [Cloud Storage trigger permissions](https://cloud.google.com/eventarc/standard/docs/run/quickstart-storage)
