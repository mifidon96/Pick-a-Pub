import { Client } from "pg";
import { db } from "./db";

// The app logs in to the database as APP_USER with IAM tokens (see db.ts).
// This creates that user. It has to run as the master user, so deploy.sh passes
// the master password in for this one call only; it is never stored in the
// Lambda's settings. Safe to run on every deploy. On a new database the app
// user then creates every table itself.
//
// Watch out: on RDS, any role that is a member of rds_iam, even indirectly, can
// only log in with an IAM token. The master user briefly joins the app user's
// role to hand its tables over, so it must leave again in the same session, or
// its password stops working on the next deploy.
export const APP_USER = "pickapub_app";

export function setupSql(database: string): string {
  return `
-- earthdistance is not a "trusted" extension, so the master user adds both.
create extension if not exists cube;
create extension if not exists earthdistance;
do $$
begin
  if not exists (select from pg_roles where rolname = '${APP_USER}') then
    create role ${APP_USER} login;
  end if;
  -- rds_iam only exists on RDS: it switches this user to IAM token logins.
  if exists (select from pg_roles where rolname = 'rds_iam') then
    grant rds_iam to ${APP_USER};
  end if;
  -- Lets the master user hand its tables over (below). Revoked at the end.
  execute format('grant ${APP_USER} to %I', current_user);
end $$;
grant connect, create on database "${database.replace(/"/g, "")}" to ${APP_USER};
grant usage, create on schema public to ${APP_USER};
-- Anything the master user created earlier now belongs to the app user, so
-- migrations (run as the app user) can change it. Sequences follow their tables.
do $$
declare r record;
begin
  for r in
    select c.relname, c.relkind from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'v') and pg_get_userbyid(c.relowner) = current_user
  loop
    execute format('alter %s public.%I owner to ${APP_USER}',
      case r.relkind when 'v' then 'view' else 'table' end, r.relname);
  end loop;
  -- Leave the app user's role again. Staying in it would make the master user
  -- an indirect member of rds_iam, which locks it to IAM logins only.
  execute format('revoke ${APP_USER} from %I', current_user);
end $$;
`;
}

export async function setupAppUser(masterPassword: string): Promise<{ ok: true; user: string; note?: string }> {
  if (!masterPassword) throw new Error("master password missing");
  // Already set up? If the app user can log in with IAM, there is nothing to do,
  // and the master login is not needed at all.
  if (process.env.PGAUTH === "iam") {
    try {
      await db().query("select 1");
      return { ok: true, user: APP_USER, note: "app user already set up" };
    } catch {
      // Not set up yet (a new database): carry on as the master user.
    }
  }
  const master = process.env.PGMASTERUSER ?? "pickapub";
  const client = new Client({
    host: process.env.PGHOST ?? "localhost",
    port: Number(process.env.PGPORT ?? 5432),
    user: master,
    password: masterPassword,
    database: process.env.PGDATABASE ?? "pickapub",
    ssl: process.env.PGSSL === "1" || process.env.PGAUTH === "iam" ? true : undefined,
  });
  await client.connect();
  try {
    await client.query(setupSql(process.env.PGDATABASE ?? "pickapub"));
  } finally {
    await client.end();
  }
  return { ok: true, user: APP_USER };
}
