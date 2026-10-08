import { readFileSync } from "node:fs";
import { runAdmin } from "./admin";
import { db } from "./db";

// Local equivalent of invoking the admin Lambda.
//   npm run admin -- migrate
//   npm run admin -- import ../pubs.json
async function main() {
  const [cmd, file] = process.argv.slice(2);
  if (cmd === "migrate") {
    console.log(await runAdmin({ action: "migrate" }));
  } else if (cmd === "import" && file) {
    const { pubs } = JSON.parse(readFileSync(file, "utf8"));
    console.log(await runAdmin({ action: "import_pubs", pubs }));
  } else {
    console.error("Usage: npm run admin -- migrate | import <pubs.json>");
    process.exitCode = 1;
  }
  await db().end();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
