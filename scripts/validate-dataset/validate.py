"""Validate prepared JSONL schema, primary keys and source foreign keys on disk."""
import argparse
import collections
import json
import pathlib
import sqlite3
import sys
import time

ROOT = pathlib.Path(__file__).resolve().parents[2]


def validate(directory):
    directory = pathlib.Path(directory).resolve()
    summary = json.loads((directory / "import-summary.json").read_text(encoding="utf-8"))
    schema = json.loads((directory / "source-schema.json").read_text(encoding="utf-8"))
    database_path = ROOT / "work/import-validation.sqlite"
    database_path.parent.mkdir(exist_ok=True)
    conn = sqlite3.connect(database_path)
    errors = []
    counts = {}
    started = time.time()
    conn.execute("PRAGMA journal_mode=OFF")
    conn.execute("PRAGMA synchronous=OFF")
    for table in summary["table_order"]:
        conn.execute(f'DROP TABLE IF EXISTS "{table}"')
        info = schema[table]
        # Store only keys used by constraints, not multi-million descriptions.
        columns = set(c.strip() for pk in info["primary_key"] for c in pk.split(","))
        columns.update(fk[0] for fk in info["foreign_keys"])
        if table in {"nlp_candidate_pairs", "case_links"}:
            columns.update(("case_id_a", "case_id_b"))
        if table == "live_replay_7d":
            columns.add("complaint_id")
        if not columns:
            columns.add(next(iter(info["columns"])))
        columns = sorted(columns)
        conn.execute(f'CREATE TABLE "{table}" (' + ",".join(f'"{c}" TEXT' for c in columns) + ")")
        placeholders = ",".join("?" for _ in columns)
        insert_sql = f'INSERT INTO "{table}" VALUES ({placeholders})'
        count = 0
        batch = []
        filename = directory / ("master" if table in {"regions", "states", "bureaus", "categories", "subcategories", "sla_policies", "institutions", "institution_aliases", "complainants", "officers"} else "facts") / f"{table}.jsonl"
        with filename.open(encoding="utf-8") as source:
            for line_number, line in enumerate(source, 1):
                data = json.loads(line)
                if set(data) != set(info["columns"]):
                    errors.append({"table": table, "line": line_number, "error": "column mismatch"})
                batch.append(tuple(data[c] for c in columns))
                count += 1
                if len(batch) >= 5000:
                    conn.executemany(insert_sql, batch)
                    batch.clear()
            if batch:
                conn.executemany(insert_sql, batch)
        for pk in info["primary_key"]:
            try:
                conn.execute(f'CREATE UNIQUE INDEX "pk_{table}" ON "{table}" ({pk})')
            except sqlite3.IntegrityError:
                errors.append({"table": table, "error": "duplicate primary key", "columns": pk})
        if count != summary["counts"][table]:
            errors.append({"table": table, "error": "row count mismatch"})
        counts[table] = count
        conn.commit()
    for table in summary["table_order"]:
        foreign_keys = schema[table]["foreign_keys"][:]
        if table == "live_replay_7d":
            foreign_keys.append(["complaint_id", "complaints", "complaint_id"])
        for column, parent, parent_column in foreign_keys:
            missing = conn.execute(f'SELECT count(*) FROM "{table}" c LEFT JOIN "{parent}" p ON c."{column}"=p."{parent_column}" WHERE c."{column}" IS NOT NULL AND p."{parent_column}" IS NULL').fetchone()[0]
            if missing:
                errors.append({"table": table, "column": column, "references": f"{parent}.{parent_column}", "missing": missing})
    conn.close()
    result = {"valid": not errors, "counts": counts, "errors": errors, "elapsed_seconds": round(time.time() - started, 2), "synthetic_not_official": True}
    (directory / "validation.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2))
    return 0 if not errors else 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", default=str(ROOT / ".data/import"))
    sys.exit(validate(parser.parse_args().input))
