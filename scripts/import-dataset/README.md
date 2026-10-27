# Import the supplied synthetic dataset

The archive is an input, excluded from Git and the application bundle. Tables and
types are read from its actual manifest, dictionary and PostgreSQL schema.

```powershell
py -3.11 -X utf8 scripts/import-dataset/prepare.py --mode curated
py -3.11 -X utf8 scripts/validate-dataset/validate.py
npx tsx scripts/import-dataset/load.ts
```

Curated mode selects 5,000 base cases across all four shards and adds both
endpoints of 50 examples of every duplicate simulation label per shard. It retains
all selected cases' children and only complete relation pairs. All institutions,
officers and geography masters remain searchable. Only referenced synthetic
complainants are retained. The resulting selection is deterministic (6,877 cases
for the supplied archive). All six stages and eight categories are represented.

Source `dashboard_daily_metrics` is intentionally excluded in curated mode: those
aggregates cover the complete historical corpus. Application analytics must query
the imported scope. Historical evidence is metadata with `mock://` URIs, not files.

Full local mode requires enough disk and PostgreSQL memory/storage:

```powershell
py -3.11 -X utf8 scripts/import-dataset/prepare.py --mode full --output .data/import-full
py -3.11 -X utf8 scripts/validate-dataset/validate.py --input .data/import-full
npx tsx scripts/import-dataset/load.ts --input .data/import-full --batch-size 1000
```

Use a provisioned PostgreSQL `DATABASE_URL` for full mode. Do not run two processes
against the same embedded PGlite directory. Stop the local app before imports.
The database loader uses bounded JSON-to-record batches, foreign key constraints,
and `ON CONFLICT DO NOTHING`. Repeated imports preserve existing mutable rows.
An incremental partition is prepared with `--offset N --limit N`; the loader also
accepts `--from-table TABLE` and `--table TABLE` to resume or limit work. Full-mode
daily metrics are aggregated across shards by date/region/bureau before loading.

Preparation and loading each persist progress JSON and failed-row JSONL reports
inside the import directory. The validator uses a disk-backed SQLite key index to
check exact headers, row counts, primary keys and every declared source foreign
key, including both endpoints of candidate/link relationships. The live database
then enforces those constraints transactionally. No million-row browser payload
is involved.

Prepared files and full import validation indexes are local operational data,
excluded from version control. The source schema is retained for reproducibility.
