Student news title identity and duplicate detection
=================================================

Newly discovered news has one `canonicalTitle` in English that describes the
specific factual development. It is shared across grades, reading languages and
publishers. A publisher's headline remains `sourceTitle`; source URLs remain
verified citations. They no longer determine whether a story is new.

Before writing an article, selecting vocabulary or generating images, the worker
compares the candidate's title and full supported facts with earlier stories.
DeepSeek performs semantic comparisons through `utils/llm`. The same event with
another headline, URL, publisher or wording is a duplicate. Additional background
or a different publication date is insufficient. A material new event or outcome
is accepted as a separate story, optionally linked by `developmentOfStoryId`.
For example, a summit opening and a later agreement can be separate stories.
The same title or source URL can therefore accompany a genuine new development.

Both pooled stories and saved private preview briefs are included, including
retired stories and previews that failed after preparing a brief. A preview
remains private; indexing it never publishes it. Incomplete searches without a
prepared brief are not indexed. Existing duplicate records are not deleted or
merged. Legacy story IDs, assignments, editions, quiz attempts and reading
history are preserved. Reusing a selected pooled story for another grade, format
or language deliberately bypasses discovery checks and retains its story ID.

The backend-only `newsStoryIdentities/{storyId}` catalog stores the shared title,
normalized title, normalized facts hash, full fact text, publication date and
scope. An idempotent backfill reads legacy pool and preview briefs without
changing them. New story IDs hash the normalized title plus factual development;
fact ordering, citation IDs and source URLs do not affect this hash. Exact title
and facts matches need no model call; paraphrased matches use semantic comparison.

Catalogs with up to 20 entries use one full-facts comparison. Larger catalogs
scan every title in batches of 120, with short factual context to retain possible
same-event matches, then compare their full facts in bounded batches. Each batch
is a resumable worker step. There is no fixed limit on the historical records
considered. Title shortlisting and semantic judgment still depend on the model;
they are not a guarantee that every differently described duplicate is detected.

Accepted identity decisions are committed atomically with the worker lease and
the catalog revision in `newsStoryIdentities/_state`. If another discovery added
a record during comparison, the same candidate is compared again against the
new catalog before acceptance. It does not repeat web discovery for that race.
Expired workers cannot write identity records or advance replacement workers.

A duplicate automatically returns the job to discovery with rejected titles and
facts in its exclusions. Each automatic cycle tries at most three candidates,
then offers a resumable error to prevent an unbounded search loop. Explicit
Retry starts a fresh bounded cycle. Discovery prompts include recent exclusions
within a size budget; acceptance checks still consider the complete catalog.
Once accepted, pool discovery publishes the brief; a private preview proceeds
to article generation and still requires the administrator's Add to pool action.

Verification
------------

Run the unit suite and the Firestore scenarios against a local emulator:

```sh
node --test functions/features/news_article_generator/news_identity.test.js
FIRESTORE_EMULATOR_HOST=127.0.0.1:8987 node --test functions/features/student_news/news_identity_emulator.test.js
```

Scenarios cover legacy and private preview backfill, source-independent identity,
semantic duplicates, meaningful updates with the same headline/URL, bounded
search/retry, concurrent differently worded discoveries, stale worker fencing,
large catalogs, intentional grade/language reuse and publication sequencing.
On 2026-11-15, all 65 news generator unit checks, 19 Firestore scenarios and
the admin preview Chrome flow passed. Provider routing and response validation
were tested with injected adapters. An optional production DeepSeek comparison
was blocked by automatic approval review before execution because it would
access a production secret and send saved article text; no live model test ran.

The configuration rules suite also checks that clients cannot read or write
the identity catalog or its revision coordinator, including through generic rules.

The Firestore rules and `onNewsGenerationRequested` worker were deployed to
`readyherox` on 2026-11-15, with rules released first so the new collection is
protected before the worker writes it. Legacy catalog backfill runs automatically
on the next new discovery; existing stories are not rewritten. Hosting was also
released with the new comparison progress label and schema. Published asset
hashes and the unauthenticated API rejection were checked after release.
