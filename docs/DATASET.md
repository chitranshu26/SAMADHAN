# Dataset provenance and reproducible imports

The source is `AICTE_Complaint_Lifecycle_Synthetic_200k.zip`, supplied by the user.
It is 244,886,565 bytes and contains four complaint shards, ten master tables,
twenty fact tables, its original PostgreSQL schema and supporting documentation.
The manifest records **200,000 complaints** and **3,161,497 workflow events** in
the complete source. All identities, institutions, histories and deadlines are
synthetic. The historical snapshot is **28 October 2026, 00:00 IST**
(`2026-10-27T18:30:00Z`), not a current AICTE feed.

The original README, manifest, dictionary and SQL were read before import.
`database/seeds/source-schema.sql` retains the actual source tables/columns.
Application-specific identity, notifications, evidence and mutable state extend
that schema instead of replacing it with invented sample JSON.

## Curated local demonstration selection

The deterministic selection takes the first 1,250 cases from each shard and both
endpoints of 50 examples of each of the six simulation labels in every shard.
Duplicates among these selections are de-duplicated by complaint ID. This yields
**6,877 complaints**, including all six stages and eight category families.
Every selected complaint's child history is retained. Candidate/link rows are
imported only when **both** complaint endpoints exist in the selection.

All 6,500 institutions, 953 source officers, eight regional groups and 36 state/UT
entries remain available. Only the 6,024 referenced synthetic complainants are
retained. Demonstration application users are seeded separately and do not
impersonate the source complainants or officers.

| Imported table | Source rows imported |
| --- | ---: |
| complaints | 6,877 |
| assignments | 7,093 |
| case_bureau_history | 7,106 |
| notices | 6,574 |
| internal_case_logs | 12,192 |
| institution_responses | 5,535 |
| case_outcomes | 5,434 |
| approvals | 5,649 |
| evidence_metadata | 19,179 |
| case_stage_history | 36,727 |
| workflow_events | 108,778 |
| notifications | 38,170 |
| sla_tracking | 6,877 |
| investigations | 1,674 |
| escalations | 1,237 |
| feedback_appeals | 398 |
| nlp_candidate_pairs | 1,200 |
| case_links | 800 |
| live_replay_7d | 2,166 |

The imported related fact total is **266,789** (excludes complaints and masters).
The master total is **14,485**. These are initial source counts; real demo actions
append additional application records. Re-running import never overwrites those
mutable cases. `record_origin` distinguishes historical and live demonstration
complaints. Historical notifications are source metadata, while operational
notifications use role-scoped application tables.

Source `dashboard_daily_metrics` is excluded in curated mode because those
aggregates refer to the complete corpus. Dashboard metrics are computed from the
authorized imported scope. Historical `mock://` evidence URIs are metadata only;
the UI must not offer them as real downloadable files. New evidence uses real
private application storage and access checks.

## Pipeline and validation

Run these while the embedded application is stopped:

```powershell
py -3.11 -X utf8 scripts/import-dataset/prepare.py --mode curated
py -3.11 -X utf8 scripts/validate-dataset/validate.py
npx tsx scripts/import-dataset/load.ts
npx tsx scripts/validate-dataset/database.ts
```

Preparation streams ZIP members through gzip and CSV readers, validates exact
headers against the actual dictionary, converts PostgreSQL types and writes
bounded JSONL streams. There are zero failed prepared rows for the supplied
selection. The disk-backed validator checked all 29 imported tables' row counts,
primary keys and declared foreign keys with **zero errors**. Both endpoints of
all imported duplicate relationships were validated. The database subsequently
enforces the PostgreSQL constraints.

The loader sends batches of 500 rows using `json_populate_recordset`, explicit
source columns and `ON CONFLICT DO NOTHING`. It records progress, failed rows,
import jobs and completion audits. A failed batch is rolled back by PostgreSQL,
then individual rows are retried to isolate/report failures. JSONL and progress
files live under `.data/import/`, excluded from Git. The dataset archive is not
included in application static files or the deployment bundle.

`database-import-result.json` records successful persistence of all 29 tables.
The replay table was resumed separately after an importer identifier check was
corrected, and all 2,166 replay records were verified in the reopened database.
`database.ts` independently opens the persisted database and audits counts,
foreign keys, record origins and valid stage ranges. Do not run a second PGlite
process while the application owns its embedded database directory.

## Full local mode and incremental imports

```powershell
py -3.11 -X utf8 scripts/import-dataset/prepare.py --mode full --output .data/import-full
py -3.11 -X utf8 scripts/validate-dataset/validate.py --input .data/import-full
npx tsx scripts/import-dataset/load.ts --input .data/import-full --batch-size 1000
```

Use provisioned PostgreSQL through `DATABASE_URL` for the full multi-million-row
corpus. Full preparation remains streaming; the key validator uses an on-disk
SQLite index. Daily historical metrics are summed across shard composite keys
before import. Full mode is implemented but **the complete 200,000-case import
has not been executed or performance-certified in this environment**.

`--offset N --limit N` prepares another bounded curated partition. `--from-table`
resumes a loader suffix; `--table` limits it to one source table. All reimports
are idempotent by source primary key. Existing application changes are preserved.
Detailed usage is in `scripts/import-dataset/README.md`.
