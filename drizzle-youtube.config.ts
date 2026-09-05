import { defineConfig } from "drizzle-kit";
import { getLocalD1Url } from "@every-app/sdk/cloudflare/server";

// SEO Forge: separate Drizzle migration stream for the YouTube Research tables
// (SQLite / D1). Points at the YouTube schema file directly, not the upstream
// barrel, so upstream's `drizzle/` journal and ours never collide on merge.
// Applied by scripts/youtube-migrate-d1.ts (wrangler only supports one
// migrations_dir per D1 binding). See docs/seoforge/PLAN.md section 1.8.
const localUrl = getLocalD1Url();

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/youtube.schema.ts",
  out: "./drizzle-youtube",
  dbCredentials: {
    url: localUrl || "",
  },
});
