/** Read-only consistency/durability audit. Stop embedded app before running. */
import fs from "node:fs";
import path from "node:path";
import { db, closeDatabase } from "../../src/lib/database/db";

async function main() {
  const directory = path.resolve(process.argv[2] || ".data/import");
  const summary = JSON.parse(fs.readFileSync(path.join(directory, "import-summary.json"), "utf8"));
  const schema = JSON.parse(fs.readFileSync(path.join(directory, "source-schema.json"), "utf8"));
  const conn = await db();
  const errors: unknown[] = [];
  const counts: Record<string, number> = {};
  try {
    for (const table of summary.table_order as string[]) {
      if (!/^[a-z][a-z0-9_]*$/.test(table) || !schema[table]) throw new Error("Unexpected table name");
      const result = await conn.query<{ count: number }>(`SELECT count(*)::int AS count FROM "aicte_demo"."${table}"`);
      counts[table] = Number(result.rows[0].count);
      if (counts[table] < summary.counts[table]) errors.push({ table, expected_minimum: summary.counts[table], actual: counts[table] });
      for (const [column, parent, parentColumn] of schema[table].foreign_keys as string[][]) {
        const invalid = await conn.query<{ count: number }>(`SELECT count(*)::int AS count FROM "aicte_demo"."${table}" c LEFT JOIN "aicte_demo"."${parent}" p ON c."${column}"=p."${parentColumn}" WHERE c."${column}" IS NOT NULL AND p."${parentColumn}" IS NULL`);
        if (Number(invalid.rows[0].count)) errors.push({ table, column, missing_references: invalid.rows[0].count });
      }
    }
    const origins = await conn.query("SELECT record_origin,count(*)::int AS count FROM aicte_demo.complaints GROUP BY record_origin");
    const stageCounts = await conn.query("SELECT current_stage,count(*)::int AS count FROM aicte_demo.complaints GROUP BY current_stage ORDER BY current_stage");
    const invalidStages = await conn.query<{ count: number }>("SELECT count(*)::int AS count FROM aicte_demo.complaints WHERE current_stage NOT BETWEEN 1 AND 6");
    if (Number(invalidStages.rows[0].count)) errors.push({ invalid_stages: invalidStages.rows[0].count });
    const result = { valid: errors.length === 0, verified_at_utc: new Date().toISOString(), operation: "independent connection reopened persisted database", errors, counts, origins: origins.rows, stages: stageCounts.rows, synthetic_not_official: true };
    fs.writeFileSync(path.join(directory, "database-validation.json"), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
    if (errors.length) process.exitCode = 1;
  } finally { await closeDatabase(); }
}
main().catch((error) => { console.error(error instanceof Error ? error.message : "Database validation failed"); process.exitCode = 1; });
