# Try RHX guest demo

The welcome page's **Try RHX** link opens /demo. No sign-up, Firebase anonymous
account, student profile, subscription or billing access is needed.
UI and orchestration live in public/features/demo and functions/features/demo.

## Wizard

Only one pane is visible at a time:

1. **Setup:** country, level and grade, from Syllabus Scope. Starting a new demo
   awards one coin.
2. **Subjects:** active syllabuses matching that country, level and grade.
   Streams are not required. Each subject shows its configured practice types.
3. **Practice:** choose the subject's language, practice type and eligible topic.
   MCQ offers Easy/Medium/Hard and a student-selected count from 1–100. The
   maximum is a fixed service limit, with no new admin parameter. Preparation,
   answering, results, answer review and inline tutor are states within this pane.
   Back to subjects allows multiple practices.
4. **News:** Continue to news appears after a valid practice completion. News
   has its own pane and is not an entry on the subjects pane. Choose
   international/local and a configured language. Read the grade-specific
   article, view pages/images/sources and highlighted vocabulary, request
   meanings in other configured languages, and submit three comprehension
   questions. Both categories can be explored. Each category retains one story
   in the current run; language changes keep that story and its original quiz.
5. **Summary:** End demo shows starting, practice, news and total coins. Only
   the totals remain visible. Start again creates a fresh run; Return home exits.

End demo is available throughout the active run. Leaving or refreshing does not
resume it. Browser memory holds the capability and activity; the demo uses no
localStorage, sessionStorage, account history or URL credentials.

## Existing content and rewards

Topic/language framework assignments determine available types. MCQ first reads
matching assessment-bank questions across diagram groups. When short, it
generates only the missing count in batches of at most five using the existing
default prompt configuration and question-generation API. A scope lease lets
simultaneous guests share replenishment. Bank questions remain after a run ends.

Practices freeze private content for grading. MCQ snapshots are stored per
question so diagram-rich practices do not fill one Firestore document. The API
returns prompts/options and withholds private keys. Essay and passage practices
reuse attached content, with a topic-scoped pool fallback. Unprepared topics
show an unavailable state; the demo adds generation rules only for MCQ.

Every accepted practice completion awards the current bonusMissionCompletionCoins
once per attempt, independently of score. Essay/passage grading is asynchronous;
a marking failure does not remove or repeat coins. Submitted answers are
immutable on retry.

Incorrect MCQs offer the existing tutor, subject to the current topic setting.
Shared guides are reused and pinned to the selected version. Mini-question
expected answers are withheld from the browser.

News reuses the published pool, configuration and existing news-generation
worker. Missing stories and language editions are prepared on demand.
Vocabulary, translated meanings and questions use existing shared jobs and UI
components. Completion awards newsArticleCompletionCoins; 3/3 adds
newsAllCorrectCoins. Amounts freeze when opening the category. Rewards are
deduplicated per story in the run, including language changes and retries.

Demo activity never creates student assignments, reading history, missions,
assessment progress or real student reward entries.

## Backend and lifecycle

functions/demo.js exports:

- **demo:** callable with action, token and input, using a strict operation list.
- **onDemoPracticeRequested:** preparation/marking worker using existing model
  services and DeepSeek/OpenAI secrets.
- **cleanupDemoSessions:** scheduled expiry cleanup every 30 minutes.

The browser creates a 256-bit capability and sends it only in callable payloads.
The backend stores its SHA-256 digest as the run ID, never the raw capability.
Every operation checks the active run and server-derived scope. Start is
idempotent for the same capability and limited to 40 starts per sender per hour.

Transient data lives under demoSessions, with attempts and news subcollections.
demoAdmission and demoQuestionPoolLeases hold admission counters and expiring
generation leases. Firestore rules exclude these roots from the legacy generic
fallback and deny direct access, including for authenticated visitors.

Runs expire after two hours. Finish revokes the run transactionally, returns
totals, deletes activity and keeps a ten-minute totals-only receipt for lost
finish responses. Expiry cleanup covers abandoned tabs. Cancellation also fences
a preparation whose first response has not reached the browser.

Workers check the active run and their lease before publishing attempts/results.
Running work may finish adding valid shared questions or news content. It
cannot recreate an ended guest run. The UI rejects late replies after navigation,
finishing or restarting.

## Integration and deployment

Existing learning feature implementations are unchanged. Integration edits add
the welcome link, /demo Hosting rewrites, function exports and protection for
the new Firestore roots.

Deploy Firestore rules before accepting guest traffic, then the three new
functions, then Hosting. The demo callable and practice worker need the existing
DEEPSEEK_API_KEY and OPENAI_API_KEY bindings. The existing news generation worker
must be active. No new administrator settings, composite indexes or student
migrations are required. This code change does not deploy the feature.

## Validation

Unit checks:

    node functions/features/demo/demo.test.js
    node public/features/demo/demo_client.test.mjs

With a local Firestore emulator:

    FIRESTORE_EMULATOR_HOST=127.0.0.1:8989 node functions/features/demo/demo_emulator.test.js
    FIRESTORE_EMULATOR_HOST=127.0.0.1:8989 node scripts/test-demo-browser.cjs

Fixtures require a loopback emulator and demo project IDs. Providers are stubbed.
Cases cover capability isolation, scope, bank shortfall/reuse, atomic coins,
grading retries, tutor policy/redaction, news language/reward identity, late
workers, finish cleanup, expiry and the real Firestore fallback rules.

The Chrome flow covers all practice types, tutor, vocabulary/translated meanings,
news questions, interrupted submission responses, summary, restart and late
preparation responses after finishing. Optional DEMO_SCREENSHOTS sets a directory
for desktop/mobile captures.

## GitHub Actions

The Demo tests workflow in .github/workflows/demo-tests.yml runs on pushes to
feature/rhx-demo and pull requests targeting main. It installs the locked
functions dependencies with Node 22, sets up Java 21, installs the Chrome
version selected by Puppeteer, and runs both unit files followed by the
Firestore and browser suites.

firebase.demo-tests.json is the test-only emulator configuration. The workflow
explicitly selects project demo-rhx-demo and starts only Firestore. Tests use
fixtures and stubbed model providers; no Firebase login, model API keys or
deployment credentials are needed. A failing test fails the job, including
when its output is copied to a log. Logs and screenshots are uploaded after
success or failure and retained for seven days.

The workflow uses read-only repository access and pinned action commits. It
does not deploy or change branch protection. After the workflow, implementation
and test files are committed and pushed together, the first push starts CI.
GitHub-hosted execution must still be checked in the repository's Actions tab.
