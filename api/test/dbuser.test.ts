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
  await admin.query("drop role if exists rds_iam");
};
await reset();
await admin.query("create role dbuser_master login password 'masterpw' createrole");
// Stands in for RDS's rds_iam role. Created by the master user so it may grant
// it, as RDS's master can.
await asSuper("dbuser_master", "masterpw", "create role rds_iam");

async function asSuper(user: string, password: string, sql: string) {
  const c = new Client({ ...base, user, password });
  await c.connect();
  try {
    return await c.query(sql);
  } finally {
    await c.end();
  }
}

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

  // On RDS, any member of rds_iam (even indirectly) can only log in with IAM,
  // so the master user must not stay in the app user's role.
  const joined = await admin.query(
    `select count(*)::int as n from pg_auth_members
      where roleid = 'pickapub_app'::regrole and member = 'dbuser_master'::regrole and (inherit_option or set_option)`);
  assert.equal(joined.rows[0].n, 0, `master left the app user's role (existing=${existing})`);
  const appIam = await admin.query("select pg_has_role('pickapub_app', 'rds_iam', 'member') as iam");
  assert.equal(appIam.rows[0].iam, true, "the app user logs in with IAM");

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
