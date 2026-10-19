import assert from "node:assert/strict";
import { Client } from "pg";
import schema from "../../db/schema.sql";

// The IAM login set-up (api/src/dbuser.ts) against a database shaped like RDS:
// a non-superuser master that owns the database. Needs a superuser to create it.
const base = {
  host: process.env.PGHOST ?? "localhost",
  port: Number(process.env.PGPORT ?? 5432),
  user: process.env.PGUSER ?? "postgres",
  password: process.env.PGPASSWORD,
};
const admin = new Client({ ...base, database: process.env.PGDATABASE });
await admin.connect();
const reset = async () => {
  await admin.query("drop database if exists dbuser_test");
  await admin.query("drop role if exists pickapub_app");
  await admin.query("drop role if exists dbuser_master");
};
await reset();
await admin.query("create role dbuser_master login password 'masterpw' createrole");

async function asUser(user: string, password: string, sql: string) {
  const c = new Client({ ...base, user, password, database: "dbuser_test" });
  await c.connect();
  try {
    return await c.query(sql);
  } finally {
    await c.end();
  }
}

for (const existing of [true, false]) {
  await admin.query("drop database if exists dbuser_test");
  await admin.query("drop role if exists pickapub_app");
  await admin.query("create database dbuser_test owner dbuser_master");
  // RDS's master can add extensions; here the superuser stands in for that.
  const ext = new Client({ ...base, database: "dbuser_test" });
  await ext.connect();
  await ext.query("create extension cube; create extension earthdistance;");
  await ext.end();
  // An existing deploy: the master user created the tables.
  if (existing) await asUser("dbuser_master", "masterpw", schema);

  process.env.PGDATABASE = "dbuser_test";
  process.env.PGMASTERUSER = "dbuser_master";
  const { setupAppUser } = await import("../src/dbuser");
  assert.deepEqual(await setupAppUser("masterpw"), { ok: true, user: "pickapub_app" });
  assert.deepEqual(await setupAppUser("masterpw"), { ok: true, user: "pickapub_app" }, "safe to run twice");

  // Locally there is no rds_iam, so give the app user a password to test as it.
  await admin.query("alter role pickapub_app password 'apppw'");
  await asUser("pickapub_app", "apppw", schema); // migrate as the app user
  const owners = await asUser("pickapub_app", "apppw",
    "select distinct tableowner from pg_tables where schemaname = 'public'");
  assert.deepEqual(owners.rows.map((r) => r.tableowner), ["pickapub_app"], `app user owns every table (existing=${existing})`);
  await asUser("pickapub_app", "apppw", "insert into users (id, display_name) values ('t', 'Test user')");
  await asUser("pickapub_app", "apppw", "drop owned by pickapub_app"); // tidy up before the next round
}

await reset();
await admin.end();
console.log("database login tests passed");
