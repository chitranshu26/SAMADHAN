/** Idempotent batched loader for the exact supplied schema. Run with `npx tsx`. */
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { parseArgs } from "node:util";
import { randomUUID } from "node:crypto";
import { db, closeDatabase } from "../../src/lib/database/db";

const { values } = parseArgs({ options: {
  input: { type: "string", default: ".data/import" },
  "batch-size": { type: "string", default: "500" },
  "from-table": { type: "string" },
  table: { type: "string" },
} });

async function main() {
  const input = path.resolve(values.input!);
  const summary = JSON.parse(fs.readFileSync(path.join(input, "import-summary.json"), "utf8"));
  const validationPath = path.join(input, "validation.json");
  if (!fs.existsSync(validationPath) || !JSON.parse(fs.readFileSync(validationPath, "utf8")).valid) {
    throw new Error("Run scripts/validate-dataset/validate.py successfully before loading.");
  }
  const schema = JSON.parse(fs.readFileSync(path.join(input, "source-schema.json"), "utf8"));
  const batchSize = Math.max(1, Math.min(2000, Number(values["batch-size"])));
  if (!Number.isFinite(batchSize)) throw new Error("Invalid batch size");
  const client = await db();
  const jobId = `IMPORT-${randomUUID()}`;
  await client.query("INSERT INTO aicte_demo.import_jobs(id,mode,status,progress,details) VALUES($1,$2,'running',0,$3::jsonb)", [jobId, summary.mode, JSON.stringify({ source: "supplied synthetic ZIP", expected_complaints: summary.complaints, resumed_from_table: values["from-table"] || null })]);
  const started = Date.now();
  const progress: Record<string, unknown> = { job_id: jobId, status: "running", mode: summary.mode, started_at: new Date().toISOString(), tables: {}, failed_rows: 0 };
  const progressPath = path.join(input, "database-progress.json");
  const failed = fs.createWriteStream(path.join(input, "database-failed-rows.jsonl"), { flags: "w" });
  const counts: Record<string, number> = {};
  let errors = 0;
  let active = !values["from-table"];
  const masterTables = new Set(["regions", "states", "bureaus", "categories", "subcategories", "sla_policies", "institutions", "institution_aliases", "complainants", "officers"]);
  const saveProgress = () => {
    progress.elapsed_seconds = Math.round((Date.now() - started) / 1000);
    progress.failed_rows = errors;
    fs.writeFileSync(progressPath, JSON.stringify(progress, null, 2));
  };
  try {
    for (const table of summary.table_order as string[]) {
      if (table === values["from-table"]) active = true;
      if (!active || (values.table && values.table !== table)) continue;
      if (!/^[a-z][a-z0-9_]*$/.test(table) || !schema[table]) throw new Error("Unexpected table name");
      const columns = Object.keys(schema[table].columns);
      const quotedColumns = columns.map((c) => `"${c}"`).join(",");
      if (table === "dashboard_daily_metrics") {
        await client.query("CREATE UNIQUE INDEX IF NOT EXISTS import_daily_metric_key ON aicte_demo.dashboard_daily_metrics(metric_date, region_id, bureau_id)");
      }
      const sql = `WITH inserted AS (INSERT INTO "aicte_demo"."${table}" (${quotedColumns}) SELECT ${quotedColumns} FROM json_populate_recordset(NULL::"aicte_demo"."${table}", $1::json) ON CONFLICT DO NOTHING RETURNING 1) SELECT count(*)::int AS count FROM inserted`;
      const filename = path.join(input, masterTables.has(table) ? "master" : "facts", `${table}.jsonl`);
      const lines = readline.createInterface({ input: fs.createReadStream(filename, "utf8"), crlfDelay: Infinity });
      let batch: Record<string, unknown>[] = [];
      let scanned = 0;
      let inserted = 0;
      const flush = async () => {
        if (!batch.length) return;
        try {
          const result = await client.query<{ count: number }>(sql, [JSON.stringify(batch)]);
          inserted += Number(result.rows[0]?.count || 0);
        } catch {
          // A failed SQL statement rolls back atomically. Retry individual rows
          // to isolate and report malformed records without abandoning the job.
          for (const row of batch) {
            try {
              const result = await client.query<{ count: number }>(sql, [JSON.stringify([row])]);
              inserted += Number(result.rows[0]?.count || 0);
            } catch (error) {
              errors++;
              failed.write(JSON.stringify({ table, error: error instanceof Error ? error.message : "database insert failed", row }) + "\n");
            }
          }
        }
        scanned += batch.length;
        batch = [];
        (progress.tables as Record<string, unknown>)[table] = { scanned, inserted, expected: summary.counts[table] };
        saveProgress();
      };
      for await (const line of lines) {
        if (!line.trim()) continue;
        batch.push(JSON.parse(line));
        if (batch.length >= batchSize) await flush();
      }
      await flush();
      const result = await client.query<{ count: number }>(`SELECT count(*)::int AS count FROM "aicte_demo"."${table}"`);
      counts[table] = Number(result.rows[0].count);
      const completedIndex = (summary.table_order as string[]).indexOf(table) + 1;
      await client.query("UPDATE aicte_demo.import_jobs SET progress=$2,details=$3::jsonb WHERE id=$1", [jobId, Math.floor(100 * completedIndex / summary.table_order.length), JSON.stringify(progress)]);
      console.log(JSON.stringify({ table, scanned, inserted, database_total: counts[table] }));
    }
    progress.status = errors ? "completed_with_failures" : "completed";
    progress.completed_at = new Date().toISOString();
    // Include every prepared table even when this run resumes a suffix.
    for (const table of summary.table_order as string[]) {
      if (!/^[a-z][a-z0-9_]*$/.test(table) || !schema[table]) throw new Error("Unexpected table name");
      if (counts[table] === undefined) {
        const result = await client.query<{ count: number }>(`SELECT count(*)::int AS count FROM "aicte_demo"."${table}"`);
        counts[table] = Number(result.rows[0].count);
      }
    }
    progress.database_counts = counts;
    await client.query("UPDATE aicte_demo.import_jobs SET status=$2,progress=100,details=$3::jsonb,completed_at=now() WHERE id=$1", [jobId, progress.status, JSON.stringify(progress)]);
    await client.query("INSERT INTO aicte_demo.audit_logs(id,actor_id,event_type,entity_id,details) VALUES($1,'SYSTEM-IMPORT','DATASET_IMPORT_COMPLETED',$2,$3::jsonb)", [randomUUID(), jobId, JSON.stringify({ mode: summary.mode, failed_rows: errors, database_counts: counts })]);
    saveProgress();
    fs.writeFileSync(path.join(input, "database-import-result.json"), JSON.stringify(progress, null, 2));
    if (errors) process.exitCode = 1;
  } catch (error) {
    progress.status = "failed";
    progress.error = error instanceof Error ? error.message : "Import failed";
    saveProgress();
    await client.query("UPDATE aicte_demo.import_jobs SET status='failed',details=$2::jsonb,completed_at=now() WHERE id=$1", [jobId, JSON.stringify(progress)]).catch(() => undefined);
    throw error;
  } finally {
    failed.end();
    await closeDatabase();
  }
}
main().catch((error) => { console.error(error instanceof Error ? error.message : "Import failed"); process.exitCode = 1; });
