/**
 * SEO Forge: applies the YouTube Research migration stream (drizzle-youtube/)
 * to a D1 database. Wrangler supports exactly one `migrations_dir` per D1
 * binding and upstream owns it (`drizzle/`), so this runner does for our stream
 * what `wrangler d1 migrations apply` does for theirs: reads the Drizzle
 * journal, skips entries already recorded in `youtube_migrations`, applies the
 * rest in order, and records them. Idempotent; safe to run on every boot.
 *
 * Usage:
 *   pnpm db:youtube:migrate:local            (local D1, binding "DB")
 *   pnpm db:youtube:migrate:prod             (remote D1, binding "DB")
 *   tsx scripts/youtube-migrate-d1.ts --remote --database open-seo-db-selfhost
 *
 * --database accepts a binding name or a D1 database name (Alchemy self-host
 * stages name the database `open-seo-db-<stage>`).
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { parseArgs } from "./cli-utils";

const args = parseArgs(process.argv.slice(2));
const isLocal = args.local === "true";
const isRemote = args.remote === "true";
const database = args.database ?? "DB";
const migrationsDir = args.dir ?? "drizzle-youtube";
const TRACKING_TABLE = "youtube_migrations";

type JournalEntry = { idx: number; tag: string };
type D1ExecuteResult = Array<{ results?: Array<Record<string, unknown>> }>;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function runWrangler(extraArgs: string[]): string {
  const target = isLocal ? "--local" : "--remote";
  return execFileSync(
    "pnpm",
    [
      "exec",
      "wrangler",
      "d1",
      "execute",
      database,
      target,
      "--yes",
      ...extraArgs,
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
  );
}

function runQuery(sql: string): Array<Record<string, unknown>> {
  const output = runWrangler(["--json", "--command", sql]);
  // wrangler prints only JSON with --json; guard anyway in case a banner leaks.
  const start = output.indexOf("[");
  const parsed = JSON.parse(output.slice(start)) as D1ExecuteResult;
  return parsed[0]?.results ?? [];
}

function readJournal(): JournalEntry[] {
  const journalPath = join(migrationsDir, "meta", "_journal.json");
  if (!existsSync(journalPath)) fail(`No journal at ${journalPath}`);
  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as {
    entries?: JournalEntry[];
  };
  return [...(journal.entries ?? [])].sort((a, b) => a.idx - b.idx);
}

function main() {
  if (isLocal === isRemote) fail("Pass exactly one of --local or --remote.");

  runWrangler([
    "--command",
    `CREATE TABLE IF NOT EXISTS ${TRACKING_TABLE} (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`,
  ]);
  const applied = new Set(
    runQuery(`SELECT name FROM ${TRACKING_TABLE}`).map((row) =>
      String(row.name),
    ),
  );

  const pending = readJournal().filter((entry) => !applied.has(entry.tag));
  if (pending.length === 0) {
    console.log(
      `YouTube migrations: nothing to apply (${applied.size} applied).`,
    );
    return;
  }

  for (const entry of pending) {
    const file = join(migrationsDir, `${entry.tag}.sql`);
    if (!existsSync(file))
      fail(`Journal names ${entry.tag} but ${file} is missing`);
    console.log(`Applying ${entry.tag}...`);
    runWrangler(["--file", file]);
    runWrangler([
      "--command",
      `INSERT INTO ${TRACKING_TABLE} (name, applied_at) VALUES ('${entry.tag}', '${new Date().toISOString()}')`,
    ]);
  }
  console.log(`YouTube migrations: applied ${pending.length}.`);
}

main();
