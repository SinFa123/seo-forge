import { getDatabaseProvider } from "../provider";
import * as sqliteYoutube from "../youtube.schema";
import * as pgYoutube from "../pg/youtube.schema";

// SEO Forge: provider-aware barrel for the YouTube Research tables, mirroring
// src/db/schema.ts. Kept separate from the upstream barrel so these tables stay
// out of upstream's Drizzle journal (own migration stream, see
// drizzle-youtube.config.ts). Repositories import their tables from here and
// `db` from "@/db"; the query builder accepts any table object, so no upstream
// barrel edit is needed.
//
// TYPE identity is the SQLite definition; runtime VALUES are whichever provider
// is active. ./schema-parity.test.ts asserts the two dialect schemas are
// structurally interchangeable, which is what makes the cast sound.
type YoutubeSchema = typeof sqliteYoutube;

const runtimeSchema =
  getDatabaseProvider() === "postgres" ? pgYoutube : sqliteYoutube;

// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- guarded by ./schema-parity.test.ts
const schema = runtimeSchema as unknown as YoutubeSchema;

export const { youtubeSavedKeywords } = schema;
