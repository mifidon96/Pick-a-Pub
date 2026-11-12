import schema from "../../../db/schema.sql";
import { db } from "../lib/db";
import { setupAppUser } from "../lib/dbuser";
import { stats } from "../services/analytics";
import type { ContentEntry } from "../services/content";
import type { FixtureInput } from "../services/fixtures";
import { applyContent } from "./content";
import { setFixtures } from "./fixtures";
import { listReports, moderateReview } from "./moderation";
import { renderPages } from "./pages";
import { decidePhoto, listPendingPhotos, listPhotosToCopy, setPhotoCopies } from "./photos";
import { claimTile, importPubs, markTiles, pubCount, tileStatus, type PubInput } from "./pubs";

export type { PubInput } from "./pubs";

// Admin actions. On AWS these run through a separate Lambda that is not behind
// API Gateway, so only someone with AWS credentials can call them:
//   aws lambda invoke --function-name pickapub-prod-admin --payload '{"action":"pub_count"}' out.json
export type AdminEvent =
  | { action: "migrate" }
  | { action: "setup_db_user"; master_password: string }
  | { action: "pub_count" }
  | { action: "import_pubs"; pubs: PubInput[]; tile?: string }
  | { action: "tile_status"; tile: string }
  | { action: "claim_tile"; tile: string }
  | { action: "mark_tiles"; tiles: { tile: string; pub_count: number }[] }
  | { action: "list_photos_to_copy"; limit?: number }
  | { action: "set_photo_copies"; results: { id: number; key?: string; gone?: boolean }[] }
  | { action: "list_pending_photos" }
  | { action: "approve_photo"; id: string }
  | { action: "reject_photo"; id: string }
  | { action: "apply_content"; entries: ContentEntry[] }
  | { action: "set_fixtures"; fixtures: FixtureInput[] }
  | { action: "render_pages" }
  | { action: "stats"; days?: number }
  | { action: "list_reports" }
  | { action: "hide_review"; id: number }
  | { action: "restore_review"; id: number }
  | { action: "delete_review"; id: number };

type Action = AdminEvent["action"];
type ActionFn<A extends Action> = (event: Extract<AdminEvent, { action: A }>) => Promise<unknown>;

// Which function runs each action. TypeScript checks every action has one.
const actions: { [A in Action]: ActionFn<A> } = {
  // Database setup (deploy.sh). setup_db_user never echoes the password back.
  setup_db_user: (e) => setupAppUser(e.master_password),
  migrate: async () => {
    await db().query(schema);
    return { ok: true, action: "migrate" };
  },

  // Pubs and area imports (admin/pubs.ts)
  import_pubs: importPubs,
  pub_count: pubCount,
  claim_tile: claimTile,
  tile_status: tileStatus,
  mark_tiles: markTiles, // after the monthly UK load

  // Our own verdicts from content/pubs.yaml (admin/content.ts)
  apply_content: applyContent,

  // Photos (admin/photos.ts)
  list_photos_to_copy: listPhotosToCopy,
  set_photo_copies: setPhotoCopies,
  list_pending_photos: listPendingPhotos,
  approve_photo: decidePhoto,
  reject_photo: decidePhoto,

  // Matches (admin/fixtures.ts)
  set_fixtures: setFixtures,

  // Pages for search engines, nightly and after each deploy (admin/pages.ts)
  render_pages: renderPages,

  // Page counts (services/analytics.ts)
  stats: (e) => stats(Math.min(Math.max(Number(e.days) || 7, 1), 90)),

  // Reported reviews (admin/moderation.ts)
  list_reports: listReports,
  hide_review: moderateReview,
  restore_review: moderateReview,
  delete_review: moderateReview,
};

export async function runAdmin(event: AdminEvent): Promise<unknown> {
  if (!Object.hasOwn(actions, event.action)) throw new Error("Unknown action");
  const run = actions[event.action] as (e: AdminEvent) => Promise<unknown>;
  return run(event);
}
