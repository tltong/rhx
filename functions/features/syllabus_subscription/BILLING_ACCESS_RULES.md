# Billing access rules

The active Firestore rules read from `readyherox` on 2026-10-31 contained a
recursive `allow read, write: if true`. Local `firestore.rules` adds a billing and
learning overlay and is configured in `firebase.json`. It has not been deployed.

The guarded roots include subscription authority/ledger, Stripe registration,
payment config, administrator membership, student learning histories, questions,
practices and results. The previous catch-all explicitly excludes these roots:
Firestore combines allows by OR, so a narrower deny alone would be ineffective.

The server clock enforces paid/grace deadlines even if a student profile is
absent. Clients cannot extend dates, change Stripe links/status, delete Stripe
billing authority, settle invoices, or forge provider registration. Administrator
membership uses existing backend callables, not direct client writes. Verified
administrator emails are checked against existing `siteAdmins` documents.
Payment configuration writes require that identity.

Student learning histories require ownership, administrator access or an active
guardian link for report reads. Link lookup uses
`guardianStudentLinks/{guardianUid}__{studentUid}`, matching ordinary Firebase UID
keys. Custom UIDs containing URI-encoded characters require a rules-safe link-key
migration before guardian report reads. Guardian reporting and sign-in are not
suspended by a child's failure. Non-admin students cannot write sibling histories.
Server-owned checkout reservations under subscription documents are also protected
from client reads and writes.
Self-service manual trial creation and admin manual subscriptions are supported.
Stripe receipts and registration remain server-owned.

This is not a complete security rewrite. Existing permissions outside the guarded
roots remain unchanged, including broader guardian-link and shared-content edit
policies. Those pre-existing policies need a separate authorization review; this
change must not be described as locking down the whole database.

The reusable helper in `firestore_student_billing.rules.inc` is copied into the
complete ruleset; tests assert they agree. It is not a standalone deployment.
Start the Firestore emulator on `127.0.0.1:8987`, project
`demo-rhx-renewal-restart`, then run:

```sh
python3 scripts/test-student-billing-rules.py
```

The script refuses remote hosts, installs the proposed complete ruleset only in
that isolated emulator project, and checks paid/grace/recovered learning,
suspension, guarded content, immutable billing authority, admin configuration,
guardian reports and trial creation. It uses emulator tokens and no cloud API.
