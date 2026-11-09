import { Pool } from "pg";
import { Signer } from "@aws-sdk/rds-signer";

// One pool per Lambda container, reused across invocations.
//
// On AWS (PGAUTH=iam) there is no database password anywhere: each new
// connection signs a 15-minute login token with the Lambda's own IAM role.
// Signing happens locally, so it needs no network access or VPC endpoint.
// Locally, PGPASSWORD is used as normal.
let pool: Pool | undefined;

export function db(): Pool {
  if (pool) return pool;
  const host = process.env.PGHOST ?? "localhost";
  const port = Number(process.env.PGPORT ?? 5432);
  const user = process.env.PGUSER ?? "postgres";
  const iam = process.env.PGAUTH === "iam";
  const signer = iam
    ? new Signer({ hostname: host, port, username: user, region: process.env.AWS_REGION ?? "eu-west-2" })
    : undefined;
  pool = new Pool({
    host,
    port,
    user,
    password: signer ? () => signer.getAuthToken() : process.env.PGPASSWORD,
    database: process.env.PGDATABASE ?? "pickapub",
    // On AWS, PGSSL=1 and NODE_EXTRA_CA_CERTS points at the RDS CA bundle.
    // IAM login always needs SSL.
    ssl: process.env.PGSSL === "1" || iam ? true : undefined,
    max: 2,
    idleTimeoutMillis: 30_000,
  });
  // An idle connection can be dropped by the server (or by a frozen Lambda
  // waking up). Without a listener that would crash the process; the pool
  // simply opens a fresh connection on the next query.
  pool.on("error", (err) => console.warn("Idle database connection lost:", err.message));
  return pool;
}
