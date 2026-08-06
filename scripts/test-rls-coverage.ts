/**
 * RLS coverage test
 *
 * Connects with an admin/direct Postgres connection and verifies every table in
 * the `public` schema (except intentionally public `lessons` and `tracks`) has:
 *   - Row Level Security enabled (`relrowsecurity = true`)
 *   - FORCE ROW LEVEL SECURITY enabled (`relforcerowsecurity = true`)
 *
 * Connection (first match wins):
 *   - DATABASE_URL       — Postgres URI (direct/admin role)
 *   - SUPABASE_DB_URL    — Supabase direct connection string
 *
 * Supabase: Dashboard → Settings → Database → Connection string → URI
 * Use the `postgres` role (not the pooler) so pg_catalog queries work reliably.
 *
 * Usage:
 *   npm run test:rls
 *
 * Exit 0 on success; exit 1 with a list of offending tables on failure.
 */

import { Client } from "pg";

const EXCLUDED_TABLES = ["lessons", "tracks"];

interface TableRlsStatus {
  tablename: string;
  relrowsecurity: boolean;
  relforcerowsecurity: boolean;
}

function getDatabaseUrl(): string | undefined {
  return process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL;
}

function excludedTableList(): string {
  return EXCLUDED_TABLES.map((name) => `'${name}'`).join(", ");
}

async function main(): Promise<void> {
  const connectionString = getDatabaseUrl();
  if (!connectionString) {
    console.error(
      [
        "Missing database connection. Set DATABASE_URL or SUPABASE_DB_URL.",
        "",
        "Supabase: Dashboard → Settings → Database → Connection string (URI).",
        "Use the direct `postgres` connection, not the transaction pooler.",
      ].join("\n"),
    );
    process.exit(1);
  }

  const client = new Client({ connectionString });

  try {
    await client.connect();

    const result = await client.query<TableRlsStatus>(`
      SELECT t.tablename, c.relrowsecurity, c.relforcerowsecurity
      FROM pg_tables t
      JOIN pg_class c ON c.relname = t.tablename
      JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = t.schemaname
      WHERE t.schemaname = 'public'
        AND t.tablename NOT IN (${excludedTableList()})
      ORDER BY t.tablename
    `);

    const missingRls: string[] = [];
    const missingForceRls: string[] = [];

    for (const row of result.rows) {
      if (!row.relrowsecurity) {
        missingRls.push(row.tablename);
      }
      if (!row.relforcerowsecurity) {
        missingForceRls.push(row.tablename);
      }
    }

    if (missingRls.length === 0 && missingForceRls.length === 0) {
      console.log(
        `RLS coverage OK (${result.rows.length} public tables checked; excluded: ${EXCLUDED_TABLES.join(", ")})`,
      );
      return;
    }

    console.error("RLS coverage check FAILED\n");

    if (missingRls.length > 0) {
      console.error("Tables missing RLS (relrowsecurity = false):");
      for (const table of missingRls) {
        console.error(`  - ${table}`);
      }
      console.error("");
    }

    if (missingForceRls.length > 0) {
      console.error(
        "Tables missing FORCE RLS (relforcerowsecurity = false):",
      );
      for (const table of missingForceRls) {
        console.error(`  - ${table}`);
      }
    }

    process.exit(1);
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error("RLS coverage test error:", error);
  process.exit(1);
});
