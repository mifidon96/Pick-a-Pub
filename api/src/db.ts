import { Pool } from "pg";

// One pool per Lambda container, reused across invocations.
let pool: Pool | undefined;

export function db(): Pool {
  if (pool) return pool;
  pool = new Pool({
    host: process.env.PGHOST ?? "localhost",
    port: Number(process.env.PGPORT ?? 5432),
    user: process.env.PGUSER ?? "postgres",
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE ?? "pickapub",
    // On AWS, PGSSL=1 and NODE_EXTRA_CA_CERTS points at the RDS CA bundle.
    ssl: process.env.PGSSL === "1" ? true : undefined,
    max: 2,
    idleTimeoutMillis: 30_000,
  });
  // An idle connection can be dropped by the server (or by a frozen Lambda
  // waking up). Without a listener that would crash the process; the pool
  // simply opens a fresh connection on the next query.
  pool.on("error", (err) => console.warn("Idle database connection lost:", err.message));
  return pool;
}
