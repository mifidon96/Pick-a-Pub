// Writes robots.txt into the built site. Run by deploy.sh after the build.
//
//   node scripts/robots.mjs <site url> <web/out folder> <environment>
//
// Only prod is open to search engines; dev would compete with it as a copy.
// sitemap.xml is written by the admin Lambda (api/src/admin/pages.ts), along
// with the pub and area pages it lists.
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const [siteUrl, outDir, env] = process.argv.slice(2);
if (!siteUrl || !outDir || !env) {
  console.error("usage: node scripts/robots.mjs <site url> <out dir> <environment>");
  process.exit(1);
}
const site = siteUrl.replace(/\/+$/, "");

const body = env === "prod"
  ? `User-agent: *
Allow: /
Disallow: /account/
Disallow: /auth/
Disallow: /pub/review/
Disallow: /offline/

Sitemap: ${site}/sitemap.xml
`
  : `User-agent: *
Disallow: /
`;
writeFileSync(join(outDir, "robots.txt"), body);
console.log(`robots.txt written (${env === "prod" ? "open to search engines" : "closed: not prod"})`);
