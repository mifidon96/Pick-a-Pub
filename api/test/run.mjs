// Runs the API tests: npm test, or npm test -- reviews photos (just those).
// Each test file is bundled with esbuild (so .sql and .json imports work like
// they do in the Lambda), then run with node. Tests that touch AWS get fake
// AWS clients (test/mock-*.ts) and dummy credentials.
import { build } from "esbuild";
import { execFileSync } from "node:child_process";

const AWS = ["@aws-sdk/client-s3", "@aws-sdk/s3-request-presigner"];
const TESTS = {
  overpass: [],
  wikimedia: [],
  routes: [],
  importer: ["@aws-sdk/client-lambda", ...AWS],
  photos: AWS,
  account: AWS,
  reviews: [],
  fixtures: ["@aws-sdk/client-lambda", ...AWS],
  analytics: [],
  dbuser: [],
};
const MOCKS = {
  "@aws-sdk/client-lambda": "./test/mock-lambda.ts",
  "@aws-sdk/client-s3": "./test/mock-s3.ts",
  "@aws-sdk/s3-request-presigner": "./test/mock-presign.ts",
};

const only = process.argv.slice(2);
for (const name of only) if (!(name in TESTS)) throw new Error(`No test called ${name}. Tests: ${Object.keys(TESTS).join(", ")}`);

for (const [name, mocks] of Object.entries(TESTS)) {
  if (only.length && !only.includes(name)) continue;
  const outfile = `.test/${name}.mjs`;
  await build({
    entryPoints: [`test/${name}.test.ts`],
    outfile,
    bundle: true,
    platform: "node",
    target: "node22",
    format: "esm",
    loader: { ".sql": "text" },
    external: ["pg-native"],
    alias: Object.fromEntries(mocks.map((m) => [m, MOCKS[m]])),
    banner: { js: "import{createRequire}from'module';const require=createRequire(import.meta.url);" },
    logLevel: "warning",
  });
  const env = mocks.length
    ? { ...process.env, AWS_REGION: "eu-west-2", AWS_ACCESS_KEY_ID: "AKIATEST", AWS_SECRET_ACCESS_KEY: "test" }
    : process.env;
  execFileSync("node", [outfile], { stdio: "inherit", env });
}
