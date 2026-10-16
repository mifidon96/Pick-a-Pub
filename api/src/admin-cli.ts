import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { writeFileSync } from "node:fs";
import { runAdmin } from "./admin";
import { parseContent } from "./content";
import { db } from "./db";

// Local equivalent of invoking the admin Lambda.
//   npm run admin -- migrate
//   npm run admin -- import ../pubs.json
//   npm run admin -- content ../content/pubs.yaml            (apply to the local database)
//   npm run admin -- content-json ../content/pubs.yaml out.json   (check it and write the Lambda payload)
async function main() {
  const [cmd, file] = process.argv.slice(2);
  if (cmd === "migrate") {
    console.log(await runAdmin({ action: "migrate" }));
  } else if (cmd === "import" && file) {
    const { pubs } = JSON.parse(readFileSync(file, "utf8"));
    console.log(await runAdmin({ action: "import_pubs", pubs }));
  } else if (cmd === "content" && file) {
    console.log(await runAdmin({ action: "apply_content", entries: parseContent(readFileSync(file, "utf8")) }));
  } else if (cmd === "content-json" && file && process.argv[4]) {
    const entries = parseContent(readFileSync(file, "utf8"));
    // Every photo listed must exist in content/photos/ next to the yaml file.
    const dir = join(dirname(file), "photos");
    const missing = entries.flatMap((e) => e.photos ?? []).filter((f) => !existsSync(join(dir, f)));
    if (missing.length) throw new Error(`Missing from content/photos/: ${missing.join(", ")}`);
    writeFileSync(process.argv[4], JSON.stringify({ action: "apply_content", entries }));
    console.log(`${file}: ${entries.length} entr${entries.length === 1 ? "y" : "ies"} OK`);
    return;
  } else {
    console.error("Usage: npm run admin -- migrate | import <pubs.json> | content <pubs.yaml> | content-json <pubs.yaml> <out.json>");
    process.exitCode = 1;
  }
  await db().end();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
