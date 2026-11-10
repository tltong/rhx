# Student profile and credential updates

The existing student feature now exposes authenticated backend APIs through
`studentProfile` (Firebase callable, `us-central1`). The account UID and
`students/{uid}` document ID are immutable. Changes target the existing Auth user;
the feature never creates a replacement account for an edit or credential reset.

Backend entry points:

- `functions/features/student/student_module.js` retains `getStudentById` for trusted
  server callers and exports the new feature APIs.
- `functions/features/student/student_profile_module.js` provides
  `createStudentProfileFeature` for dependency-injected server use and tests.
- `public/features/student/student_profile_module.js` provides callable wrappers.
  Existing student/signup/guardian helpers route writes through the backend.

## Permissions

Enabled, authenticated students may read and edit their own details. Registered
guardians may read and edit students with an active guardian link. Verified site
administrators may read and edit any student. Global student listing is admin-only.
Unrelated users, inactive guardians, and disabled accounts are rejected.

Students changing their own username or PIN, or manually retrying a credential
change, must have signed in within the last five minutes, based on the verified
Firebase ID token's `auth_time`. A stale student login returns `failed-precondition`
with instructions to sign in again. Refreshing an old ID token alone does not count
as signing in again. Linked guardians use their existing signed-in session for all
student edits, including username changes and PIN resets, with no additional login,
student credential proof, or verification prompt. The backend still checks that the
guardian account is enabled and the link is active. Administrators use fresh Auth
status and administrator membership checks. Guardian links are rechecked inside
profile and rename-start transactions. New or reactivated guardian-created links
still require proof of access to the student's login.

The callable derives identity from `request.auth`; input cannot supply the actor,
role, audit UID, or profile version. Trusted internal workers process only previously
authorized, server-owned username requests.

## APIs

Callable payload: `{action: "APIName", input: {...}}`. Backend module APIs take the
input plus `{auth: {uid, token}}` as a second argument. Browser wrappers obtain the
current Firebase identity automatically and reject responses after an account switch.

| API | Input / result |
| --- | --- |
| `getStudentProfile` | `{studentId}` → redacted profile or `null` |
| `getStudentSummary` | `{studentId}` → limited summary for self, linked guardian, or admin |
| `listStudentProfiles` | `{limit?, cursor?}` → `{items, nextCursor}`; admin-only; limit 1–100 |
| `searchStudentProfiles` | `{name, yearOfBirth, level, grade}` → exact-identity summaries; registered guardians/admins |
| `createStudentProfile` | `{studentId, name, username, country, level, yearOfBirth, standardAtYearOfRegistration}` → profile; finalizes the authenticated signup UID only |
| `updateStudentProfile` | `{studentId, expectedVersion, changes}` → saved profile |
| `isStudentUsernameAvailable` | `{username}` → `{available}`; public signup check, no profile/UID disclosure |
| `changeStudentUsername` | `{studentId, expectedVersion, username, requestId}` → operation status |
| `getStudentCredentialChange` | `{studentId, requestId?}` → operation status; without request ID returns the pending operation or `null` |
| `retryStudentUsernameChange` | `{studentId, requestId}` → operation status |
| `resetStudentPin` | `{studentId, expectedVersion, newPin}` → `{studentId, pinChanged: true}` |
| `linkStudentToGuardian` | `{guardianId, studentId, relationship, studentIdToken?}` → active link; a guardian's new link requires login proof |
| `updateGuardianStudentLink` | `{guardianId, studentId, relationship?, state?, studentIdToken?}` → updated link; guardian reactivation requires fresh proof |
| `unlinkStudentFromGuardian` | `{guardianId, studentId}` → unlink receipt |

Profile changes allow only `name`, `yearOfBirth`, `country`, `level`, `schoolId`,
and `currentGrade`. Username/email/PIN, IDs, registration history, audit fields,
internal locks, and arbitrary fields are rejected in generic profile updates.
Missing legacy `profileVersion` means `0`; successful edits increment it in a
transaction. A stale version returns `aborted`. Writes patch the existing document
so unrelated fields and all student-ID references remain intact. Profile-change
receipts record changed field names and actor IDs without credential values.

```js
const profile = await getStudentProfile({studentId});
const updated = await updateStudentProfile({
  studentId, expectedVersion: profile.profileVersion,
  changes: {name: "Updated name", yearOfBirth: 2016, schoolId},
});
```

## School and academic alignment

A school assignment requires an active school and parent locations in the
student's country and level, plus a valid configured stream. The backend derives
the stream ID from the school; clients cannot override it. If the stream or
academic scope changes, its current-grade assignment and syllabus languages must
be valid before any records are changed. A missing year assignment blocks the
change until the stream is configured.

One Firestore transaction patches the student, updates
`streamSubscriptions/{studentId}`, and reconciles active syllabus subscriptions.
New subjects are created, shared subjects retain their subscription/history,
and subjects outside the new stream/year become `inactive`. The unsubscribe
cleanup workflow is deliberately not used: existing assessments, results,
practice attempts, rewards, guardian links, and billing records are retained.
A school change within the same stream preserves existing subject subscriptions.
Existing active assessment-cleanup jobs block incompatible subject activation.

Academic corrections use `academicReferenceYear` and `gradeAtReferenceYear`,
anchored to the current UTC year. Original `yearOfRegistration`,
`registrationDate`, and `standardAtYearOfRegistration` remain historical facts.
Academic-scope, availability, summary, and dashboard readers use the new reference
when present and fall back to the legacy registration fields otherwise.

The transaction supports up to 200 existing subscriptions and 100 target subjects;
larger migrations fail before writing. Updating the stream definition on a school
does not bulk-update its existing students. Reassigning that same school through
`updateStudentProfile` realigns an affected student's stream and subjects.

## Username recovery

Usernames retain the existing 3–40 character lowercase convention and derived
Auth email, `username@rhx.com`. Firebase UID is never changed.

1. A transaction reserves `studentUsernames/{newUsername}`, records a durable
   `studentCredentialChanges/{operationId}` request, and locks the student's profile.
   Existing legacy usernames are also checked before a reservation is accepted.
2. A leased worker updates that same UID's Auth email. If Auth already has the
   desired email, the worker skips the completed step.
3. A transaction updates the profile username/email and version, activates the new
   mapping, releases the old mapping, unlocks the profile, and marks the operation
   `completed`.

The create trigger starts processing; `retryStudentUsernameChanges` runs every
five minutes to recover transient failures and expired worker leases. The ten-minute
lease exceeds the callable/worker runtime limits. Repeated requests with the same
request ID and original payload are idempotent. Reusing that ID for another payload
returns `already-exists`. Concurrent profile edits or renames are blocked while a
rename is pending, preventing stale data from overwriting a completed Auth update.

Clients must display success only for `status: "completed"`. `pending` or
`processing` means the request is accepted and can be polled. A confirmed Auth
collision marks it `failed`, leaves the original login intact, and releases only
the unused new reservation. Unexpected out-of-band Auth/profile changes yield
`blocked`; an administrator must repair the conflicting external state, then use
the retry API. The worker does not overwrite unrelated changes automatically.

## PINs

PINs remain exactly six digits and are Firebase Auth passwords. A reset updates
only the existing Auth UID's password; PINs are never included in operation
documents, audit receipts, logs, or profile responses. Legacy plaintext copies are
deleted before reset and during other profile/username edits. Signup no longer
stores a PIN in Firestore. This change does not run a bulk production migration.

If an Auth response is lost, a PIN may already have changed. Retry using the same
new PIN; the backend does not persist a secret in order to replay password resets.
The Auth password is the sole credential authority, so deleting the obsolete
Firestore copy cannot invalidate an existing login. Re-sign in with new credentials
when Firebase requires it after a credential change.

## Guardian-link authority and compatibility

Guardian-link writes are backend-only because active links grant edit rights.
The existing guardian discovery flow still uses exact name, birth year, level,
and grade, but matching those fields alone does not grant a link. A guardian must
confirm the selected student's current username and PIN. The browser signs the
student in through a temporary Firebase app using memory-only persistence, obtains
a fresh student ID token, and signs out/deletes that temporary app. The guardian's
primary session is preserved. The PIN is sent only to Firebase Auth.

For a new or reactivated link, `linkStudentToGuardian` / `updateGuardianStudentLink`
accept `studentIdToken`. The backend verifies its Firebase signature and project,
checks revocation, requires the selected student UID, password sign-in provider,
and an authentication time within five minutes. Neither token nor PIN is persisted.
Existing active links remain active; this change does not bulk-relink existing
guardians or require them to repeat the original linking process.
An existing active guardian may manage its relationship; students may manage their
own links (recent sign-in for activation), and administrators may manage links
directly. Unlinked users cannot fetch another student's summary to manufacture
search criteria. Inactive or deleted links confer no edit access.

The existing guardian browser feature uses the new backend operations
`linkStudentToGuardian`, `updateGuardianStudentLink`, and `unlinkStudentFromGuardian`.
Username/job records reject all direct client access. Raw student
document reads are restricted to the student or site administrator; guardians use
redacted backend reads. Direct student profile writes are denied for every client,
including admins. Client stream/subject writes must align with the selected school.

Older pages that loaded only Auth/Firestore lazily load the Functions compat SDK
on their first profile request. A failed SDK load can be retried.

## Guardian dashboard editor

Each active linked-student card has an **Edit student** button. Its dialog offers
name and birth-year edits, country/level/grade and school changes, a separate
username change, and a masked new-PIN/confirmation form. Guardians use their
existing signed-in session for every edit, without entering their own or the
student's current login credentials. Creating a new link still uses the separate
student-login proof dialog.

School and grade changes use the configured academic scope and the authenticated
school directory. A shared autocomplete updates suggestions after a 200 ms typing
pause, starting at the first character and supporting multiple word prefixes.
It loads ten suggestions at a time and displays city/town and state labels.
Both location filters can be left blank. State changes clear city/town; country
and level changes clear an incompatible selection. Keyboard or touch selection
sets the pending school ID, and **Save details** commits it. The backend derives
the school's stream and preserves existing student history. See
[searchable-list.md](searchable-list.md) for the generic feature API.

Successful profile saves refresh the linked-student cards. Stale edits prompt a
reload; pending username operations disable conflicting saves, survive closing and
reopening the editor, and offer a status check. A lost rename response is recovered
using its original request ID. PIN fields clear after success and on close, and no
existing PIN is displayed.

## Verification and release

Run unit/regression tests and the two-emulator integration suite:

```sh
node --test --test-isolation=none functions/features/student/student_profile.test.js \
  functions/features/student/student_feature.test.js

FIRESTORE_EMULATOR_HOST=127.0.0.1:8785 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
  GCLOUD_PROJECT=demo-rhx-student-profile node --test functions/student_profile_emulator.test.js

FIRESTORE_EMULATOR_HOST=127.0.0.1:8785 \
  node --test functions/student_profile_rules_emulator.test.js

FIRESTORE_EMULATOR_HOST=127.0.0.1:8785 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
  GCLOUD_PROJECT=demo-rhx-student-profile node scripts/test-student-profile-browser.cjs

FIRESTORE_EMULATOR_HOST=127.0.0.1:8785 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
  GCLOUD_PROJECT=demo-rhx-student-profile node scripts/test-guardian-link-proof-browser.cjs

FIRESTORE_EMULATOR_HOST=127.0.0.1:8785 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
  GCLOUD_PROJECT=demo-rhx-student-profile node scripts/test-guardian-student-edit-browser.cjs
```

Integration tests use real Auth and Firestore emulators, exercise login with new
credentials, and inject Auth and Firestore failures to verify recovery. They check
UID/history preservation, all three roles, recent-auth checks, stale edits, revoked
links, username collisions, expired leases, signup, safe PIN handling, and school
reconciliation. The browser test covers actual facade/handler integration and SDK
load/account-switch behavior with an isolated SDK transport. The guardian browser
test exercises the real page and proof helper with Auth/Firestore persistence,
including cancellation, wrong PIN rejection, token linking, secondary-session
cleanup, and the masked PIN field.
The dashboard-editor browser test uses an older guardian session to edit profile,
school, username, and PIN details, verifies real new-credential sign-ins and
history retention, and covers pagination, cancellation, stale versions, pending
and lost-response rename recovery, and revoked-link denial.

Release `studentProfile`, `onStudentUsernameChangeRequested`, and
`retryStudentUsernameChanges`, plus Firestore indexes/rules and the updated Hosting
scripts. Deploy APIs and indexes first; wait for indexes to be ready, then publish
the compatible browser helpers and enforce the new write rules. Existing Firestore
profiles begin at version zero; username mappings are adopted lazily. This
release does not bulk-edit production student accounts.

The deployment helper supports that order without running unrelated Functions
codebase hooks:

```sh
bash scripts/deploy-firebase.sh firestore-indexes
bash scripts/deploy-firebase.sh student-profile
# Confirm both new indexes are READY before continuing.
bash scripts/deploy-firebase.sh hosting
bash scripts/deploy-firebase.sh firestore-rules
```

The deployed runtime identity needs Firebase Auth user read/update permissions
and Firestore read/write permissions. Students and guardians must reload older
open pages after the client/API/rules rollout.
