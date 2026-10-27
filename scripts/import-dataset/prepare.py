"""Stream the supplied synthetic ZIP into typed, connected JSONL import batches.

No generated complaints or invented source columns are introduced. Re-running the
database loader is idempotent. Full mode also streams; only the selected ID set in
curated mode and a small metrics aggregate are held in memory.
"""
from __future__ import annotations

import argparse
import collections
import csv
import gzip
import hashlib
import io
import json
import pathlib
import re
import sys
import time
import zipfile
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parents[2]
DEFAULT_ARCHIVE = pathlib.Path.home() / "Downloads/AICTE_Complaint_Lifecycle_Synthetic_200k.zip"
MASTER_ORDER = ["regions", "states", "bureaus", "categories", "subcategories", "sla_policies", "institutions", "institution_aliases", "complainants", "officers"]
FACT_ORDER = ["complaints", "assignments", "case_bureau_history", "notices", "internal_case_logs", "institution_responses", "case_outcomes", "approvals", "evidence_metadata", "case_stage_history", "workflow_events", "notifications", "sla_tracking", "investigations", "escalations", "feedback_appeals", "nlp_candidate_pairs", "case_links", "dashboard_daily_metrics", "live_replay_7d"]


def schema_info(sql: str):
    tables = {}
    for name, body in re.findall(r"CREATE TABLE IF NOT EXISTS (\w+)\s*\((.*?)\n\);", sql, re.S):
        columns = {}
        for line in body.splitlines():
            found = re.match(r"\s*(\w+) (TEXT|DATE|BOOLEAN|BIGINT|DOUBLE PRECISION|TIMESTAMPTZ|JSONB)\b", line)
            if found:
                columns[found[1]] = found[2]
        tables[name] = {"columns": columns, "primary_key": re.findall(r"PRIMARY KEY \((.*?)\)", body), "foreign_keys": re.findall(r"FOREIGN KEY \((\w+)\) REFERENCES (\w+)\((\w+)\)", body)}
    return tables


def source_rows(archive: zipfile.ZipFile, filename: str, expected: list[str]):
    with archive.open(filename) as raw, gzip.GzipFile(fileobj=raw) as uncompressed, io.TextIOWrapper(uncompressed, encoding="utf-8", newline="") as text:
        reader = csv.DictReader(text)
        if reader.fieldnames != expected:
            raise ValueError(f"Schema mismatch in {filename}: {reader.fieldnames!r} != {expected!r}")
        yield from reader


def typed_row(row, columns):
    out = {}
    for name, datatype in columns.items():
        value = row[name]
        if value == "":
            out[name] = None
        elif datatype == "BOOLEAN":
            if value.lower() not in {"0", "1", "true", "false"}:
                raise ValueError(f"Invalid BOOLEAN {name}={value!r}")
            out[name] = value.lower() in {"1", "true"}
        elif datatype == "BIGINT":
            out[name] = int(value)
        elif datatype == "DOUBLE PRECISION":
            out[name] = float(value)
        elif datatype == "JSONB":
            out[name] = json.loads(value)
        else:
            if datatype == "TIMESTAMPTZ":
                datetime.fromisoformat(value.replace("Z", "+00:00"))
            elif datatype == "DATE":
                datetime.strptime(value, "%Y-%m-%d")
            out[name] = value
    return out


def prepare(args):
    destination = pathlib.Path(args.output).resolve()
    destination.mkdir(parents=True, exist_ok=True)
    for folder in ("master", "facts"):
        (destination / folder).mkdir(exist_ok=True)
    started = time.time()
    progress_file = destination / "progress.json"

    def progress(**kwargs):
        status = {"operation": "prepare", "mode": args.mode, "elapsed_seconds": round(time.time() - started, 2), **kwargs}
        progress_file.write_text(json.dumps(status, indent=2), encoding="utf-8")
        print(json.dumps(status), flush=True)

    with zipfile.ZipFile(args.archive) as archive:
        prefix = next(n.rsplit("/", 1)[0] for n in archive.namelist() if n.endswith("/manifest.json"))
        manifest = json.loads(archive.read(f"{prefix}/manifest.json"))
        dictionary = json.loads(archive.read(f"{prefix}/schema_dictionary.json"))
        # Read required provenance documents before touching any rows.
        readme = archive.read(f"{prefix}/README.md").decode("utf-8")
        sql = archive.read(f"{prefix}/postgres_schema.sql").decode("utf-8")
        tables = schema_info(sql)
        (destination / "source-manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        (destination / "source-schema.json").write_text(json.dumps(tables, indent=2), encoding="utf-8")
        (destination / "SOURCE_README.md").write_text(readme, encoding="utf-8")
        (ROOT / "database/seeds/source-schema.sql").write_text(sql, encoding="utf-8")
        shard_names = sorted({n.split("/")[2] for n in archive.namelist() if "/shards/" in n and n.endswith("/complaints.csv.gz")})
        selected: set[str] = set()
        label_selection = collections.Counter()
        if args.mode == "curated":
            per_shard = max(1, args.limit // len(shard_names))
            for shard in shard_names:
                filename = f"{prefix}/shards/{shard}/complaints.csv.gz"
                for i, row in enumerate(source_rows(archive, filename, dictionary["complaints"]["columns"])):
                    if i >= args.offset + per_shard:
                        break
                    if i >= args.offset:
                        selected.add(row["complaint_id"])
                counts = collections.Counter()
                filename = f"{prefix}/shards/{shard}/nlp_candidate_pairs.csv.gz"
                for row in source_rows(archive, filename, dictionary["nlp_candidate_pairs"]["columns"]):
                    label = row["ground_truth_synthetic"]
                    if counts[label] < args.pairs_per_class:
                        selected.update((row["case_id_a"], row["case_id_b"]))
                        counts[label] += 1
                        label_selection[label] += 1
            progress(status="selection_ready", selected_complaints=len(selected), labels=dict(label_selection))
        counts = {}
        failures = 0
        complaint_complainants = set()
        # Discover referenced complainants without retaining entire complaint rows.
        if args.mode == "curated":
            for shard in shard_names:
                for row in source_rows(archive, f"{prefix}/shards/{shard}/complaints.csv.gz", dictionary["complaints"]["columns"]):
                    if row["complaint_id"] in selected:
                        complaint_complainants.add(row["complainant_id"])

        with (destination / "failed-rows.jsonl").open("w", encoding="utf-8") as failed:
            for table in MASTER_ORDER + FACT_ORDER:
                if table == "dashboard_daily_metrics" and args.mode == "curated":
                    # Source aggregates refer to all 200k rows. Never import them
                    # into a selected-scope dashboard as though they matched it.
                    continue
                group = "master" if table in MASTER_ORDER else "facts"
                files = [f"{prefix}/master/{table}.csv.gz"] if group == "master" else [f"{prefix}/shards/{shard}/{table}.csv.gz" for shard in shard_names]
                out_path = destination / group / f"{table}.jsonl"
                temp_path = out_path.with_suffix(".jsonl.tmp")
                count = 0
                metrics = collections.defaultdict(lambda: [0, 0, 0, 0])
                with temp_path.open("w", encoding="utf-8", newline="\n") as out:
                    for filename in files:
                        for line_number, row in enumerate(source_rows(archive, filename, dictionary[table]["columns"]), 2):
                            if args.mode == "curated":
                                if table == "complainants" and row["complainant_id"] not in complaint_complainants:
                                    continue
                                if table in {"nlp_candidate_pairs", "case_links"}:
                                    if row["case_id_a"] not in selected or row["case_id_b"] not in selected:
                                        continue
                                elif group == "facts" and row.get("complaint_id") not in selected:
                                    continue
                            try:
                                data = typed_row(row, tables[table]["columns"])
                            except (ValueError, KeyError, TypeError) as error:
                                failures += 1
                                failed.write(json.dumps({"file": filename, "line": line_number, "error": str(error), "row": row}) + "\n")
                                continue
                            if table == "dashboard_daily_metrics":
                                key = (data["metric_date"], data["region_id"], data["bureau_id"])
                                for i, column in enumerate(("submitted_count", "disposed_count", "sla_breach_trigger_count", "new_escalation_count")):
                                    metrics[key][i] += data[column] or 0
                            else:
                                out.write(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n")
                                count += 1
                    if table == "dashboard_daily_metrics":
                        for key, values in sorted(metrics.items()):
                            data = dict(zip(dictionary[table]["columns"], (*key, *values)))
                            out.write(json.dumps(data, separators=(",", ":")) + "\n")
                            count += 1
                temp_path.replace(out_path)
                counts[table] = count
                progress(status="preparing", table=table, rows=count, failed_rows=failures)
        summary = {
            "synthetic_not_official": True,
            "mode": args.mode,
            "source_archive": str(pathlib.Path(args.archive).resolve()),
            "source_size_bytes": pathlib.Path(args.archive).stat().st_size,
            "simulated_as_of_utc": manifest["simulated_as_of_utc"],
            "prepared_at_utc": datetime.now(timezone.utc).isoformat(),
            "selection": "First bounded rows per shard plus both endpoints of bounded examples of every simulation label; retain all child rows and only relations whose endpoints are selected." if args.mode == "curated" else "All source rows; global daily metrics summed across shard composite keys.",
            "selected_pair_examples_by_class": dict(label_selection),
            "table_order": [t for t in MASTER_ORDER + FACT_ORDER if t in counts],
            "counts": counts,
            "complaints": counts["complaints"],
            "related_records": sum(v for k, v in counts.items() if k not in MASTER_ORDER and k != "complaints"),
            "master_records": sum(v for k, v in counts.items() if k in MASTER_ORDER),
            "failed_rows": failures,
            "source_aggregates_excluded": args.mode == "curated",
            "historical_evidence_metadata_only": True,
        }
        (destination / "import-summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
        if args.mode == "curated":
            (destination / "selected-complaints.txt").write_text("\n".join(sorted(selected)) + "\n", encoding="utf-8")
        progress(status="complete" if failures == 0 else "complete_with_failures", complaints=summary["complaints"], related_records=summary["related_records"], failed_rows=failures)
        return 1 if failures else 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", default=str(DEFAULT_ARCHIVE))
    parser.add_argument("--mode", choices=("curated", "full"), default="curated")
    parser.add_argument("--limit", type=int, default=5000, help="Base case count before paired examples")
    parser.add_argument("--offset", type=int, default=0, help="Per-shard base offset for an incremental partition")
    parser.add_argument("--pairs-per-class", type=int, default=50)
    parser.add_argument("--output", default=str(ROOT / ".data/import"))
    sys.exit(prepare(parser.parse_args()))
