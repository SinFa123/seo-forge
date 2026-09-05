import { defineConfig } from "drizzle-kit";
import { loadLocalEnv } from "./scripts/cli-utils";

// SEO Forge: separate Drizzle migration stream for the YouTube Research tables
// (Postgres). Own output folder AND own tracking table so `drizzle-kit migrate`
// for upstream's stream (drizzle-pg.config.ts) and ours never interfere.
loadLocalEnv();

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/pg/youtube.schema.ts",
  out: "./drizzle-pg-youtube",
  migrations: {
    table: "youtube_drizzle_migrations",
  },
  dbCredentials: {
    url: process.env.POSTGRES_DATABASE_URL!,
  },
});
